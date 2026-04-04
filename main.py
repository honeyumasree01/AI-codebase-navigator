from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app_routes import router
from db import queries


@asynccontextmanager
async def lifespan(app: FastAPI):
    queries.db_init()
    yield


app = FastAPI(title="codebase-navigator", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
