from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

# Load .env from backend/ when running from project root
load_dotenv(Path(__file__).resolve().parent / ".env")

from routers import ask, benchmark, genie, globe, report, predictive
from services.cache import warm_cache
from services.kafka_processor import kafka_processor


@asynccontextmanager
async def lifespan(app: FastAPI):
    await warm_cache()
    # Start mock Kafka streams
    await kafka_processor.start()
    yield
    # Stop mock Kafka streams
    await kafka_processor.stop()


app = FastAPI(title="Crisis Topography API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Ensure unhandled exceptions still return CORS headers so the browser can read the error."""
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "http://localhost:3000"},
    )

app.include_router(globe.router, prefix="/api/globe")
app.include_router(benchmark.router, prefix="/api")
app.include_router(ask.router, prefix="/api")
app.include_router(genie.router, prefix="/api")
app.include_router(predictive.router, prefix="/api")
app.include_router(report.router)
