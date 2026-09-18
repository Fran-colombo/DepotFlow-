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

MAX_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1600
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
