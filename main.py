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

# Wildcard subdomains like *.vercel.app are not valid literal Origin values; use regex.
# allow_credentials=True cannot be combined with allow_origins=["*"] (browser CORS rules).
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "https://ai-codebase-navigator.vercel.app",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
