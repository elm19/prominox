import re

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.crud.process_image import upload_dir
from app.crud.product_file import upload_dir as product_upload_dir

router = APIRouter(prefix="/media", tags=["Media"])

_STORED_NAME = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp)$")
_MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}

@router.get("/process-images/{stored_name}")
def read_process_image(stored_name: str):
    if not _STORED_NAME.match(stored_name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    path = upload_dir() / stored_name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return FileResponse(
        path,
        media_type=_MEDIA_TYPES[stored_name.rsplit(".", 1)[1]],
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


_PRODUCT_NAME = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp|pdf)$")
_PRODUCT_TYPES = {**_MEDIA_TYPES, "pdf": "application/pdf"}

@router.get("/product-files/{stored_name}")
def read_product_file(stored_name: str):
    if not _PRODUCT_NAME.match(stored_name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    path = product_upload_dir() / stored_name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(
        path,
        media_type=_PRODUCT_TYPES[stored_name.rsplit(".", 1)[1]],
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )
