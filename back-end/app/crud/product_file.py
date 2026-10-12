"""Product images and PDFs on local disk; metadata in PostgreSQL."""
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.crud.process_image import sniff_content_type
from app.models.product import ProductFileDB

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_FILES_PER_KIND = 20
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}

def upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR) / "product-files"
    path.mkdir(parents=True, exist_ok=True)
    return path

def sniff_file_type(data: bytes) -> str | None:
    """Real type from the file's bytes: JPEG, PNG, WebP or PDF."""
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return sniff_content_type(data)

def max_bytes(content_type: str) -> int:
    return MAX_PDF_BYTES if content_type == "application/pdf" else MAX_IMAGE_BYTES

def count_by_kind(db: Session, product_id: int, kind: str) -> int:
    return db.query(ProductFileDB).filter(ProductFileDB.product_id == product_id, ProductFileDB.kind == kind).count()

def save_file(db: Session, product_id: int, filename: str, data: bytes, content_type: str) -> ProductFileDB:
    stored_name = f"{uuid.uuid4().hex}{EXTENSIONS[content_type]}"
    (upload_dir() / stored_name).write_bytes(data)
    file = ProductFileDB(
        product_id=product_id,
        kind="pdf" if content_type == "application/pdf" else "image",
        filename=Path(filename).name[:200] or "file",
        stored_name=stored_name,
        content_type=content_type,
        size_bytes=len(data),
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file

def get_file(db: Session, product_id: int, file_id: int) -> ProductFileDB | None:
    return db.query(ProductFileDB).filter(ProductFileDB.product_id == product_id, ProductFileDB.id == file_id).first()

def delete_file(db: Session, file: ProductFileDB) -> None:
    (upload_dir() / file.stored_name).unlink(missing_ok=True)
    db.delete(file)
    db.commit()
