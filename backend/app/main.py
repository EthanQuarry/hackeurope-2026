"""FastAPI application — CORS, route registration, health check."""

from __future__ import annotations

import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import HealthResponse
from app.routes.analyze import router as analyze_router
from app.routes.websocket import router as ws_router
from app.routes.data import router as data_router
from app.routes.stream import router as stream_router
from app.routes.threats import router as threats_router
from app.routes.comms import router as comms_router
from app.routes.response import router as response_router
from agents.adversary_routes import router as adversary_router

# Load .env before anything else
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="Satellite Threat Detection System",
    description="Multi-AI agent pipeline for orbital threat analysis",
    version="1.0.0",
)

# CORS — allow frontend dev server and common origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*",  # wide open for hackathon demo
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(analyze_router)
app.include_router(ws_router)
app.include_router(data_router)
app.include_router(stream_router)
app.include_router(threats_router)
app.include_router(comms_router)
app.include_router(response_router)
app.include_router(adversary_router)


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok")
