from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Load .env from backend/ when running from project root
load_dotenv(Path(__file__).resolve().parent / ".env")

from .routers import ask, benchmark, countries, globe
from .services.data_loader import load_all_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.data = await load_all_data()
    yield


app = FastAPI(title="Crisis Topography API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(globe.router, prefix="/api/globe")
app.include_router(benchmark.router, prefix="/api")
app.include_router(ask.router, prefix="/api")
app.include_router(countries.router, prefix="/api")
