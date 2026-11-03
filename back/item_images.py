import logging
import shutil
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import DB_PATH, get_db

router = APIRouter(tags=["item-images"])
logger = logging.getLogger(__name__)

MAX_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1600
MAX_UNIT_PHOTOS = 12
MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def images_dir() -> Path:
    path = DB_PATH.parent / "item_images"
    path.mkdir(parents=True, exist_ok=True)
    return path


def stored_image_path(filename: str) -> Path:
    return images_dir() / Path(filename).name


def copy_item_image(source: models.Item, dest: models.Item) -> None:
    """Copy the source photo onto dest when dest does not already have one."""
    if not source.image_filename or dest.image_filename:
        return
    if dest.id is None or source.id == dest.id:
        return

    src_path = stored_image_path(source.image_filename)
    if not src_path.is_file():
        return

    ext = src_path.suffix.lower() or ".jpg"
    filename = f"{dest.id}_{uuid4().hex[:12]}{ext}"
    try:
        shutil.copy2(src_path, stored_image_path(filename))
    except OSError:
        logger.warning(
            "No se pudo copiar la imagen de item %s a item %s",
            source.id,
            dest.id,
            exc_info=True,
        )
        return
    dest.image_filename = filename
    logger.info("Imagen copiada de item %s a item %s (%s)", source.id, dest.id, filename)


def _unlink(filename: str) -> None:
    if not filename:
        return
    path = stored_image_path(filename)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass


def unit_photo_rows(db: Session, unit_id: int) -> list:
    return (
        db.query(models.UnitPhoto)
        .filter(models.UnitPhoto.unit_id == unit_id)
        .order_by(models.UnitPhoto.position.asc(), models.UnitPhoto.id.asc())
        .all()
    )


def photo_counts(db: Session, unit_ids: list) -> dict:
    if not unit_ids:
        return {}
    from sqlalchemy import func
    rows = (
        db.query(models.UnitPhoto.unit_id, func.count(models.UnitPhoto.id))
        .filter(models.UnitPhoto.unit_id.in_(unit_ids))
        .group_by(models.UnitPhoto.unit_id)
        .all()
    )
    return {unit_id: int(count) for unit_id, count in rows}


def ensure_cover_photo(db: Session, unit: models.ItemUnit) -> None:
    if not unit.image_filename:
        return
    exists = (
        db.query(models.UnitPhoto.id)
        .filter(
            models.UnitPhoto.unit_id == unit.id,
            models.UnitPhoto.filename == unit.image_filename,
        )
        .first()
    )
    if exists:
        return
    db.add(models.UnitPhoto(unit_id=unit.id, filename=unit.image_filename, position=0))
    db.flush()


def sync_cover(unit: models.ItemUnit, photos: list) -> None:
    unit.image_filename = photos[0].filename if photos else None


def delete_all_unit_photos(db: Session, unit: models.ItemUnit) -> None:
    rows = unit_photo_rows(db, unit.id)
    names = {row.filename for row in rows}
    if unit.image_filename:
        names.add(unit.image_filename)
    for name in names:
        _unlink(name)
    if rows:
        (
            db.query(models.UnitPhoto)
            .filter(models.UnitPhoto.unit_id == unit.id)
            .delete(synchronize_session=False)
        )
    unit.image_filename = None


def _photo_payload(rows: list) -> list:
    return [
        {"id": row.id, "filename": row.filename, "position": index}
        for index, row in enumerate(rows)
    ]


def delete_stored_image(item: models.Item) -> None:
    if not item.image_filename:
        return
    path = stored_image_path(item.image_filename)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass
    item.image_filename = None


def _load_image(data: bytes) -> Image.Image:
    try:
        img = Image.open(BytesIO(data))
        img.load()
        return img
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no es una imagen válida. Usá JPG, PNG, WEBP o similar.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo leer la imagen.",
        ) from exc


def _save_processed(item_id: int, img: Image.Image) -> str:
    if getattr(img, "n_frames", 1) > 1:
        img.seek(0)

    img.thumbnail((MAX_SIDE, MAX_SIDE))
    has_alpha = img.mode in ("RGBA", "LA") or (
        img.mode == "P" and "transparency" in img.info
    )

    if has_alpha:
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        ext = "png"
        save_kwargs = {"format": "PNG", "optimize": True}
    else:
        if img.mode != "RGB":
            img = img.convert("RGB")
        ext = "jpg"
        save_kwargs = {"format": "JPEG", "quality": 85, "optimize": True}

    filename = f"{item_id}_{uuid4().hex[:12]}.{ext}"
    img.save(stored_image_path(filename), **save_kwargs)
    return filename


@router.post("/items/{item_id}/image")
async def upload_item_image(
    item_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    item = (
        db.query(models.Item)
        .filter(models.Item.id == item_id, models.Item.status == 1)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item no encontrado")

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo está vacío",
        )
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen no puede superar los 8 MB",
        )

    img = _load_image(data)
    delete_stored_image(item)
    item.image_filename = _save_processed(item_id, img)
    db.commit()
    db.refresh(item)
    return {
        "ok": True,
        "has_image": True,
        "image_filename": item.image_filename,
    }


@router.get("/items/{item_id}/image")
def get_item_image(item_id: int, db: Annotated[Session, Depends(get_db)]):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item or not item.image_filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este producto no tiene imagen",
        )

    path = stored_image_path(item.image_filename)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró el archivo de imagen",
        )

    media_type = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/items/{item_id}/image")
def delete_item_image(
    item_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    item = (
        db.query(models.Item)
        .filter(models.Item.id == item_id, models.Item.status == 1)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item no encontrado")
    if not item.image_filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este producto no tiene imagen",
        )

    delete_stored_image(item)
    db.commit()
    return {"ok": True, "has_image": False}


@router.post("/units/{unit_id}/image")
async def upload_unit_image(
    unit_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pieza no encontrada")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío")
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen no puede superar los 8 MB",
        )

    img = _load_image(data)
    return _add_unit_photo(db, unit, img)


def _add_unit_photo(db: Session, unit: models.ItemUnit, img: Image.Image) -> dict:
    ensure_cover_photo(db, unit)
    photos = unit_photo_rows(db, unit.id)
    if len(photos) >= MAX_UNIT_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Una pieza puede tener hasta {MAX_UNIT_PHOTOS} fotos",
        )
    filename = _save_processed(f"unit{unit.id}", img)
    position = (photos[-1].position + 1) if photos else 0
    row = models.UnitPhoto(unit_id=unit.id, filename=filename, position=position)
    db.add(row)
    db.flush()
    photos = unit_photo_rows(db, unit.id)
    sync_cover(unit, photos)
    db.commit()
    return {
        "ok": True,
        "has_image": True,
        "image_filename": unit.image_filename,
        "photo_count": len(photos),
        "photos": _photo_payload(photos),
    }


@router.get("/units/{unit_id}/photos")
def list_unit_photos(
    unit_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pieza no encontrada")
    photos = unit_photo_rows(db, unit.id)
    return {"photos": _photo_payload(photos)}


@router.get("/units/{unit_id}/photos/{photo_id}")
def get_unit_photo(unit_id: int, photo_id: int, db: Annotated[Session, Depends(get_db)]):
    row = (
        db.query(models.UnitPhoto)
        .filter(models.UnitPhoto.id == photo_id, models.UnitPhoto.unit_id == unit_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la foto")
    path = stored_image_path(row.filename)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el archivo de imagen")
    media_type = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/units/{unit_id}/photos/{photo_id}")
def delete_unit_photo(
    unit_id: int,
    photo_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pieza no encontrada")
    row = (
        db.query(models.UnitPhoto)
        .filter(models.UnitPhoto.id == photo_id, models.UnitPhoto.unit_id == unit_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la foto")
    _unlink(row.filename)
    db.delete(row)
    db.flush()
    photos = unit_photo_rows(db, unit.id)
    sync_cover(unit, photos)
    db.commit()
    return {
        "ok": True,
        "has_image": bool(unit.image_filename),
        "image_filename": unit.image_filename,
        "photo_count": len(photos),
        "photos": _photo_payload(photos),
    }


@router.get("/units/{unit_id}/image")
def get_unit_image(unit_id: int, db: Annotated[Session, Depends(get_db)]):
    unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == unit_id).first()
    if not unit or not unit.image_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Esta pieza no tiene imagen")
    path = stored_image_path(unit.image_filename)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el archivo de imagen")
    media_type = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/units/{unit_id}/image")
def delete_unit_image(
    unit_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pieza no encontrada")
    if not unit.image_filename and not unit_photo_rows(db, unit.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Esta pieza no tiene imagen")
    delete_all_unit_photos(db, unit)
    db.commit()
    return {"ok": True, "has_image": False, "photo_count": 0, "photos": []}
