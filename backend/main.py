from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routers import countries, mismatch, compare, ask
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

app.include_router(countries.router, prefix="/api")
app.include_router(mismatch.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(ask.router, prefix="/api")