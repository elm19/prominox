from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session
from app.database import Base, engine, get_db
from app.models import Station

# Automatically create the stations table in Postgres
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Prominox Station Test API")

@app.get("/")
def root():
    return {"status": "FastAPI is running"}

@app.get("/stations")
def get_stations(db: Session = Depends(get_db)):
    # Query all stations from the database
    stations = db.query(Station).all()
    return {"count": len(stations), "stations": stations}