"""Image storage on local disk; metadata in PostgreSQL."""
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models.process_image import ProcessImageDB

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_PER_PROCESS = 10
ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

def upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR) / "process-images"
    path.mkdir(parents=True, exist_ok=True)
    return path

def sniff_content_type(data: bytes) -> str | None:
    """Detect the real type from the file's bytes, not from the client-supplied header."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None

def save_image(db: Session, process_id: int, filename: str, data: bytes, content_type: str) -> ProcessImageDB:
    stored_name = f"{uuid.uuid4().hex}{ALLOWED_TYPES[content_type]}"
    (upload_dir() / stored_name).write_bytes(data)
    image = ProcessImageDB(
        process_id=process_id,
        filename=Path(filename).name[:200] or "image",
        stored_name=stored_name,
        content_type=content_type,
        size_bytes=len(data),
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image

def get_image(db: Session, process_id: int, image_id: int) -> ProcessImageDB | None:
    return (
        db.query(ProcessImageDB)
        .filter(ProcessImageDB.process_id == process_id, ProcessImageDB.id == image_id)
        .first()
    )

def count_images(db: Session, process_id: int) -> int:
    return db.query(ProcessImageDB).filter(ProcessImageDB.process_id == process_id).count()

def delete_image(db: Session, image: ProcessImageDB) -> None:
    (upload_dir() / image.stored_name).unlink(missing_ok=True)
    db.delete(image)
    db.commit()
