from io import BytesIO
from datetime import datetime
from typing import List, Optional, Tuple

import pytz
from fastapi import HTTPException
from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
from auth import get_user_name_by_id
from dtos.movementsDTO import MovementCreateDTO
from item_categories import normalize_lookup
from item_import import _find_shed, _find_zone, parse_quantity
from item_service import ItemServiceError
from movements import execute_movement, validate_movement

TIMEZONE = pytz.timezone("America/Argentina/Buenos_Aires")

CHECKLIST_HEADERS = [
    "id",
    "nombre",
    "descripcion",
    "categoria",
    "cantidad",
    "deposito_origen",
    "zona_origen",
    "deposito_destino",
    "zona_destino",
    "salio",
    "llego",
    "controlo",
]

HEADER_ALIASES = {
    "id": "id",
    "item_id": "id",
    "itemid": "id",
    "nombre": "nombre",
    "descripcion": "descripcion",
    "descripción": "descripcion",
    "categoria": "categoria",
    "categoría": "categoria",
    "cantidad": "cantidad",
    "deposito_origen": "deposito_origen",
    "depósito_origen": "deposito_origen",
    "galpon_origen": "deposito_origen",
    "galpón_origen": "deposito_origen",
    "zona_origen": "zona_origen",
    "deposito_destino": "deposito_destino",
    "depósito_destino": "deposito_destino",
    "destino_deposito": "deposito_destino",
    "destino_depósito": "deposito_destino",
    "galpon_destino": "deposito_destino",
    "galpón_destino": "deposito_destino",
    "deposito": "deposito_destino",
    "depósito": "deposito_destino",
    "galpon": "deposito_destino",
    "galpón": "deposito_destino",
    "zona_destino": "zona_destino",
    "destino_zona": "zona_destino",
    "zona": "zona_destino",
    "salio": "salio",
    "salió": "salio",
    "llego": "llego",
    "llegó": "llego",
    "controlo": "controlo",
    "controló": "controlo",
    "controlado_por": "controlo",
    "controlado por": "controlo",
}

CHECKLIST_COLUMNS = ("salio", "llego", "controlo")


class ExportChecklistItem(BaseModel):
    id: int
    cantidad: Optional[int] = None


class ExportChecklistRequest(BaseModel):
    items: Optional[List[ExportChecklistItem]] = None
    item_ids: Optional[List[int]] = None


def resolve_export_items(payload: ExportChecklistRequest) -> List[Tuple[int, Optional[int]]]:
    if payload.items:
        seen = set()
        ordered = []
        for row in payload.items:
            if row.id in seen:
                continue
            seen.add(row.id)
            ordered.append((row.id, row.cantidad))
        if not ordered:
            raise ItemServiceError("Seleccioná al menos un producto", 400)
        return ordered

    if payload.item_ids:
        unique_ids = list(dict.fromkeys(payload.item_ids))
        if not unique_ids:
            raise ItemServiceError("Seleccioná al menos un producto", 400)
        return [(item_id, None) for item_id in unique_ids]

    raise ItemServiceError("Seleccioná al menos un producto", 400)


def _cell_value(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return value


def _error_message(exc) -> str:
    if isinstance(exc, HTTPException):
        detail = exc.detail
        if isinstance(detail, str):
            return detail
        return str(detail)
    if isinstance(exc, ItemServiceError):
        return exc.message
    return str(exc)


def parse_item_id(raw) -> int:
    if raw is None or (isinstance(raw, str) and not str(raw).strip()):
        raise ValueError("El id es obligatorio y no debe modificarse")

    if isinstance(raw, bool):
        raise ValueError("El id debe ser un número entero")

    if isinstance(raw, int):
        return raw

    if isinstance(raw, float):
        if raw.is_integer():
            return int(raw)
        raise ValueError("El id debe ser un número entero")

    text = str(raw).strip()
    if text.isdigit():
        return int(text)
    raise ValueError("El id debe ser un número entero")


def _map_update_headers(header_row):
    mapping = {}
    for index, raw in enumerate(header_row, start=1):
        key = HEADER_ALIASES.get(normalize_lookup(raw))
        if key and key not in mapping:
            mapping[key] = index
    if "id" not in mapping:
        raise ValueError(
            "Falta la columna obligatoria id. Usá el Excel exportado desde Inventario."
        )
    if "deposito_destino" not in mapping:
        raise ValueError(
            "Falta la columna de depósito destino (deposito_destino)."
        )
    if "zona_destino" not in mapping:
        raise ValueError("Falta la columna de zona destino (zona_destino).")
    return mapping


def _is_empty_update_row(row_data: dict) -> bool:
    fields = ("id", "deposito_destino", "zona_destino", "nombre")
    return all(not str(_cell_value(row_data.get(col)) or "").strip() for col in fields)


def _current_user_label(db: Session, current_user: dict) -> str:
    try:
        return get_user_name_by_id(db, current_user["user_id"])
    except Exception:
        return current_user.get("username") or "Usuario"


def _record_in_place_move(
    db: Session,
    item: models.Item,
    from_shed_id: int,
    from_zone_id: Optional[int],
    to_shed_id: int,
    to_zone_id: int,
    quantity: int,
    user_id: int,
    username: str,
):
    movement = models.Movement(
        item_id=item.id,
        item_name=item.name,
        from_shed_id=from_shed_id,
        to_shed_id=to_shed_id,
        from_zone_id=from_zone_id,
        to_zone_id=to_zone_id,
        quantity=quantity,
        user_id=user_id,
        username=username,
    )
    db.add(movement)
    db.commit()
    db.refresh(item)


def relocate_item(
    db: Session,
    item: models.Item,
    to_shed: models.Shed,
    to_zone: models.Zone,
    quantity: int,
    current_user: dict,
    username: str,
) -> str:
    if item.status != 1:
        raise ValueError("El producto está eliminado")

    if (item.actualAmount or 0) <= 0:
        raise ValueError("No se puede trasladar: el producto no tiene stock")

    if quantity <= 0:
        raise ValueError("La cantidad a trasladar debe ser mayor a 0")

    if item.actualAmount < quantity:
        raise ValueError(
            f"Stock insuficiente. Disponible: {item.actualAmount}"
        )

    from_shed_id = item.shed_id
    from_zone_id = item.zone_id

    if from_shed_id == to_shed.id and from_zone_id == to_zone.id:
        return "skipped"

    user_id = current_user.get("user_id")
    if not user_id:
        raise ValueError("No se pudo identificar al usuario")

    existing_at_dest = (
        db.query(models.Item)
        .filter(
            models.Item.id != item.id,
            models.Item.name == item.name,
            models.Item.category == item.category,
            models.Item.zone_id == to_zone.id,
            models.Item.status == 1,
        )
        .first()
    )

    move_all = quantity == item.actualAmount
    if existing_at_dest is None and move_all:
        item.shed_id = to_shed.id
        item.zone_id = to_zone.id
        _record_in_place_move(
            db,
            item,
            from_shed_id,
            from_zone_id,
            to_shed.id,
            to_zone.id,
            quantity,
            user_id,
            username,
        )
        return "updated"

    movement_data = MovementCreateDTO(
        item_id=item.id,
        from_shed_id=from_shed_id,
        to_shed_id=to_shed.id,
        from_zone_id=from_zone_id,
        to_zone_id=to_zone.id,
        quantity=quantity,
        username=username,
    )
    source_item, resolved_from_zone = validate_movement(db, movement_data)
    execute_movement(db, movement_data, user_id, source_item, resolved_from_zone)
    return "merged" if existing_at_dest is not None else "updated"


def _exclude_sheet_from_print(ws):
    ws.page_setup.orientation = "portrait"
    ws.print_area = "A1:A1"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.oddHeader.left.text = ""
    ws.oddFooter.left.text = ""


def _add_locations_reference(wb, db: Session, traslado_sheet, dest_start_row: int, dest_end_row: int):
    sheds = db.query(models.Shed).order_by(models.Shed.name.asc()).all()
    zones = (
        db.query(models.Zone)
        .options(joinedload(models.Zone.shed))
        .join(models.Shed, models.Zone.shed_id == models.Shed.id)
        .order_by(models.Shed.name.asc(), models.Zone.name.asc())
        .all()
    )

    sheet = wb.create_sheet("Depositos y zonas")
    sheet["A1"] = "NO IMPRIMIR — Copiá de acá los nombres exactos de depósito y zona para el destino."
    sheet["A1"].font = Font(bold=True, color="B42318", size=12)
    sheet.merge_cells("A1:B1")
    sheet.row_dimensions[1].height = 22

    sheet["A2"] = "deposito"
    sheet["B2"] = "zona"
    header_fill = PatternFill("solid", fgColor="1D4ED8")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Border(
        left=Side(style="thin", color="98A2B3"),
        right=Side(style="thin", color="98A2B3"),
        top=Side(style="thin", color="98A2B3"),
        bottom=Side(style="thin", color="98A2B3"),
    )
    for col in (1, 2):
        cell = sheet.cell(2, col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin

    for index, zone in enumerate(zones, start=3):
        shed_name = zone.shed.name if zone.shed else ""
        sheet.cell(index, 1, shed_name).border = thin
        sheet.cell(index, 2, zone.name).border = thin

    if not zones:
        sheet["A3"] = "No hay zonas cargadas. Creálas en Gestión depósitos."

    sheet.column_dimensions["A"].width = 36
    sheet.column_dimensions["B"].width = 28
    sheet.column_dimensions["D"].hidden = True
    sheet["D2"] = "depositos_validos"
    sheet["D2"].font = Font(bold=True, color="667085", size=9)
    for index, shed in enumerate(sheds, start=3):
        sheet.cell(index, 4, shed.name)

    _exclude_sheet_from_print(sheet)

    if dest_end_row >= dest_start_row and sheds:
        last_shed_row = 2 + len(sheds)
        dv = DataValidation(
            type="list",
            formula1=f"='Depositos y zonas'!$D$3:$D${last_shed_row}",
            allow_blank=True,
            showDropDown=False,
        )
        dv.error = "Usá un depósito de la hoja Depositos y zonas"
        dv.errorTitle = "Depósito inválido"
        dv.prompt = "Elegí un depósito de la lista"
        dv.promptTitle = "Depósito destino"
        dv.showErrorMessage = True
        dv.showInputMessage = True
        traslado_sheet.add_data_validation(dv)
        dv.add(f"H{dest_start_row}:H{dest_end_row}")


def build_transfer_checklist(db: Session, export_items: List[Tuple[int, Optional[int]]]) -> bytes:
    unique_pairs = []
    seen = set()
    for item_id, cantidad in export_items:
        if item_id in seen:
            continue
        seen.add(item_id)
        unique_pairs.append((item_id, cantidad))

    unique_ids = [item_id for item_id, _ in unique_pairs]
    items = (
        db.query(models.Item)
        .options(joinedload(models.Item.shed), joinedload(models.Item.zone))
        .filter(models.Item.id.in_(unique_ids), models.Item.status == 1)
        .all()
    )
    by_id = {item.id: item for item in items}

    ordered = []
    for item_id, requested_qty in unique_pairs:
        item = by_id.get(item_id)
        if not item or (item.actualAmount or 0) <= 0:
            continue
        if requested_qty is None:
            quantity = item.actualAmount
        else:
            try:
                quantity = int(requested_qty)
            except (TypeError, ValueError):
                raise ItemServiceError(f"Cantidad inválida para {item.name}", 400)
            if quantity <= 0:
                raise ItemServiceError(
                    f"La cantidad a trasladar de '{item.name}' debe ser mayor a 0",
                    400,
                )
            if quantity > item.actualAmount:
                raise ItemServiceError(
                    f"'{item.name}' solo tiene {item.actualAmount} en stock",
                    400,
                )
        ordered.append((item, quantity))

    if not ordered:
        raise ItemServiceError(
            "Ninguno de los productos seleccionados tiene stock para trasladar",
            400,
        )

    wb = Workbook()
    sheet = wb.active
    sheet.title = "Traslado"

    title_font = Font(bold=True, size=16, color="1D4ED8")
    subtitle_font = Font(size=11, color="344054")
    header_fill = PatternFill("solid", fgColor="1D4ED8")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    id_fill = PatternFill("solid", fgColor="E4E7EC")
    check_fill = PatternFill("solid", fgColor="FEF3C7")
    dest_fill = PatternFill("solid", fgColor="EFF6FF")
    thin = Border(
        left=Side(style="thin", color="98A2B3"),
        right=Side(style="thin", color="98A2B3"),
        top=Side(style="thin", color="98A2B3"),
        bottom=Side(style="thin", color="98A2B3"),
    )
    check_border = Border(
        left=Side(style="medium", color="344054"),
        right=Side(style="medium", color="344054"),
        top=Side(style="medium", color="344054"),
        bottom=Side(style="medium", color="344054"),
    )
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center", wrap_text=True)
    dest_align = Alignment(horizontal="left", vertical="center", wrap_text=False)

    sheet.merge_cells("A1:L1")
    sheet["A1"] = "CONTROL DE TRASLADO DE STOCK"
    sheet["A1"].font = title_font
    sheet["A1"].alignment = Alignment(horizontal="left", vertical="center")
    sheet.row_dimensions[1].height = 24

    today = datetime.now(TIMEZONE).strftime("%d/%m/%Y")
    sheet.merge_cells("A2:L2")
    sheet["A2"] = f"Fecha: {today}    |    Productos: {len(ordered)}    |    Imprimir y marcar a mano"
    sheet["A2"].font = subtitle_font

    sheet.merge_cells("A3:F3")
    sheet["A3"] = "Salida controlada por: ______________________________"
    sheet["A3"].font = Font(size=11, bold=True)
    sheet.merge_cells("G3:L3")
    sheet["G3"] = "Llegada controlada por: ______________________________"
    sheet["G3"].font = Font(size=11, bold=True)
    sheet.row_dimensions[3].height = 22

    sheet.merge_cells("A4:L4")
    sheet["A4"] = (
        "Completá deposito_destino y zona_destino con los nombres exactos de la hoja "
        "'Depositos y zonas' (esa hoja no se imprime). No cambies la columna id. "
        "Las columnas salio / llego / controlo son solo para el control impreso. "
        "No se pueden trasladar productos sin stock."
    )
    sheet["A4"].font = Font(size=9, italic=True, color="667085")
    sheet["A4"].alignment = Alignment(wrap_text=True, vertical="center")
    sheet.row_dimensions[4].height = 36

    header_row = 6
    for col, header in enumerate(CHECKLIST_HEADERS, start=1):
        cell = sheet.cell(header_row, col, header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = thin

    sheet.auto_filter.ref = f"A{header_row}:L{header_row + len(ordered)}"
    sheet.freeze_panes = "A7"

    for offset, (item, quantity) in enumerate(ordered):
        row = header_row + 1 + offset
        shed_name = item.shed.name if item.shed else ""
        zone_name = item.zone.name if item.zone else ""
        values = {
            "id": item.id,
            "nombre": item.name or "",
            "descripcion": item.description or "",
            "categoria": item.category or "",
            "cantidad": quantity,
            "deposito_origen": shed_name,
            "zona_origen": zone_name,
            "deposito_destino": shed_name,
            "zona_destino": zone_name,
            "salio": "",
            "llego": "",
            "controlo": "",
        }
        sheet.row_dimensions[row].height = 22
        for col, header in enumerate(CHECKLIST_HEADERS, start=1):
            cell = sheet.cell(row, col, values[header])
            cell.border = thin
            cell.alignment = center if header in ("id", "cantidad", *CHECKLIST_COLUMNS) else (
                dest_align if header in ("deposito_destino", "zona_destino", "deposito_origen", "zona_origen") else left
            )
            if header == "id":
                cell.fill = id_fill
                cell.protection = Protection(locked=True)
                if offset == 0:
                    cell.comment = Comment(
                        "No modificar. Identifica el producto para la actualización masiva.",
                        "Inventario",
                    )
            elif header in ("deposito_destino", "zona_destino"):
                cell.fill = dest_fill
            elif header in CHECKLIST_COLUMNS:
                cell.fill = check_fill
                cell.border = check_border

    widths = [8, 28, 28, 24, 11, 22, 18, 26, 18, 10, 10, 18]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width

    last_data_row = header_row + len(ordered)
    sheet.print_area = f"A1:L{last_data_row}"
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.fitToPage = True
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.horizontalCentered = True
    sheet.page_margins = PageMargins(left=0.4, right=0.4, top=0.5, bottom=0.5, header=0.25, footer=0.25)
    sheet.print_title_rows = "1:6"
    sheet.print_options.horizontalCentered = True
    sheet.oddFooter.left.text = "Control de traslado de stock"
    sheet.oddFooter.right.text = "Página &P de &N"

    _add_locations_reference(wb, db, sheet, header_row + 1, last_data_row)

    instructions = wb.create_sheet("Manual")
    lines = [
        "MANUAL DE TRASLADO Y ACTUALIZACIÓN MASIVA",
        "",
        "1. En Inventario seleccioná los productos a trasladar y usá Exportar traslado.",
        "2. Imprimí SOLO la hoja Traslado. Las hojas Depositos y zonas y Manual no se imprimen.",
        "3. En origen marcá la columna salio. En destino marcá llego y anotá quién controló.",
        "4. Cuando el traslado físico ya está hecho, cambiá deposito_destino y zona_destino.",
        "5. Usá los nombres exactos de la hoja Depositos y zonas (depósito + zona de esa misma fila).",
        "6. No cambies la columna id. Sin ese id el sistema no puede actualizar el producto correcto.",
        "7. deposito_origen y zona_origen quedan como referencia de dónde salió. No se usan para actualizar.",
        "8. Subí el mismo archivo en Actualización masiva. No uses Carga masiva: esa opción crea productos.",
        "9. No se puede trasladar un producto sin stock.",
        "10. Si en destino ya existe el mismo producto, el stock se fusiona ahí.",
        "11. Si deposito_destino y zona_destino siguen iguales al origen, esa fila se omite.",
        "11. cantidad es cuánto se mueve (la elegís al exportar). Si la dejás vacía se mueve el stock actual.",
        "13. controlo es opcional: si lo completás, queda como responsable del movimiento.",
        "14. Guardá el archivo como .xlsx (Excel).",
    ]
    title_font_manual = Font(bold=True, size=14, color="1D4ED8")
    for index, line in enumerate(lines, start=1):
        cell = instructions[f"A{index}"]
        cell.value = line
        if index == 1:
            cell.font = title_font_manual
    instructions.column_dimensions["A"].width = 130
    _exclude_sheet_from_print(instructions)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def update_items_from_excel(db: Session, file_bytes: bytes, current_user: dict) -> dict:
    try:
        workbook = load_workbook(BytesIO(file_bytes), data_only=True)
    except Exception:
        raise ItemServiceError("El archivo no es un Excel válido (.xlsx)", 400)

    sheet = workbook["Traslado"] if "Traslado" in workbook.sheetnames else workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if len(rows) < 2:
        raise ItemServiceError("El archivo está vacío", 400)

    header_row = None
    header_index = 0
    for index, raw_row in enumerate(rows):
        mapped = {}
        for col_index, raw in enumerate(raw_row or (), start=1):
            key = HEADER_ALIASES.get(normalize_lookup(raw))
            if key and key not in mapped:
                mapped[key] = col_index
        if "id" in mapped and "deposito_destino" in mapped and "zona_destino" in mapped:
            header_row = raw_row
            header_index = index
            break

    if header_row is None:
        raise ItemServiceError(
            "No se encontraron las columnas id, deposito_destino y zona_destino. "
            "Usá el Excel exportado desde Inventario.",
            400,
        )

    header_map = _map_update_headers(header_row)
    updated = 0
    merged = 0
    skipped = 0
    errors = []
    fallback_username = _current_user_label(db, current_user)

    for excel_row, raw_row in enumerate(rows[header_index + 1 :], start=header_index + 2):
        row_data = {}
        for column, col_index in header_map.items():
            value = raw_row[col_index - 1] if raw_row and col_index <= len(raw_row) else None
            row_data[column] = _cell_value(value)

        if _is_empty_update_row(row_data):
            continue

        try:
            item_id = parse_item_id(row_data.get("id"))
            item = (
                db.query(models.Item)
                .options(joinedload(models.Item.shed), joinedload(models.Item.zone))
                .filter(models.Item.id == item_id)
                .first()
            )
            if not item:
                raise ValueError(f"No existe un producto con id {item_id}")
            if item.status != 1:
                raise ValueError("El producto está eliminado")
            if (item.actualAmount or 0) <= 0:
                raise ValueError("No se puede trasladar: el producto no tiene stock")

            deposito = str(row_data.get("deposito_destino") or "").strip()
            zona_name = str(row_data.get("zona_destino") or "").strip()
            if not deposito:
                raise ValueError("El depósito destino es obligatorio")
            if not zona_name:
                raise ValueError("La zona destino es obligatoria")

            shed = _find_shed(db, deposito)
            if not shed:
                raise ValueError(f"Depósito '{deposito}' no encontrado")

            zone = _find_zone(db, shed.id, zona_name)
            if not zone:
                raise ValueError(
                    f"Zona '{zona_name}' no existe en depósito '{shed.name}'"
                )

            raw_quantity = row_data.get("cantidad")
            if raw_quantity is None or str(raw_quantity).strip() == "":
                quantity = item.actualAmount
            else:
                quantity = parse_quantity(raw_quantity)

            username = str(row_data.get("controlo") or "").strip() or fallback_username
            result = relocate_item(
                db,
                item,
                shed,
                zone,
                quantity,
                current_user,
                username,
            )
            if result == "skipped":
                skipped += 1
            elif result == "merged":
                merged += 1
            else:
                updated += 1
        except (ValueError, ItemServiceError, HTTPException) as exc:
            db.rollback()
            errors.append({"row": excel_row, "message": _error_message(exc)})
        except Exception:
            db.rollback()
            errors.append({"row": excel_row, "message": "Error inesperado al procesar la fila"})

    return {
        "updated": updated,
        "merged": merged,
        "skipped": skipped,
        "errors": errors,
    }
