from sqlalchemy import Column, Float, Integer, String
from sqlalchemy.orm import relationship
from app.database import Base

class DepartmentDB(Base):
    """A department is the boundary box that groups processes on the factory map."""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    # Position of the department box on the factory map
    position_x = Column(Float, nullable=True)
    position_y = Column(Float, nullable=True)

    processes = relationship("ProcessDB", back_populates="department")

    @property
    def process_count(self) -> int:
        return len(self.processes)
