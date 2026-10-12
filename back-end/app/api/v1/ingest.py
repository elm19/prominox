from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.rrt import IngestResult
import app.crud.process as crud_process
import app.crud.rrt as crud_rrt

router = APIRouter(prefix="/ingest", tags=["RRT ingestion"])

@router.post("/{token}", response_model=IngestResult, status_code=status.HTTP_201_CREATED)
def receive_machine_data(token: str, payload: Any = Body(...), db: Session = Depends(get_db)):
    """Endpoint Node-RED posts to. The token in the URL identifies the machine; keep the URL secret."""
    process = crud_rrt.get_by_token(db, token)
    if process is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingestion link")
    if not process.rrt_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="RRT is disabled for this machine")
    try:
        inserted, rows, received_at = crud_rrt.ingest(db, process, payload)
    except crud_rrt.RrtError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    except crud_process.ReadingValidationError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": f"{len(exc.errors)} invalid value(s); nothing was stored.",
                "errors": [error.model_dump(mode="json") for error in exc.errors],
            },
        )
    return IngestResult(inserted=inserted, rows=rows, received_at=received_at)
