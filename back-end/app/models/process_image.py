from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship
from app.database import Base

class ProcessImageDB(Base):
    """Metadata of an uploaded image; the file itself lives in settings.UPLOAD_DIR."""
    __tablename__ = "process_images"

    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)       # original name, for display
    stored_name = Column(String, nullable=False, unique=True)  # uuid-based name on disk
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    process = relationship("ProcessDB", back_populates="images")

    @property
    def url(self) -> str:
        return f"/api/v1/media/process-images/{self.stored_name}"
