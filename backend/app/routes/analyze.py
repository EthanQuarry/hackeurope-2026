"""POST /api/analyze — accepts satellite data, kicks off analysis pipeline."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter

from app.models import AnalyzeRequest, AnalyzeResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory store of running analyses (for demo — not production-grade)
running_analyses: dict[str, asyncio.Task] = {}


@router.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """Accept satellite data and return an analysis ID.

    The actual pipeline runs via WebSocket — this endpoint is for
    triggering analysis when the client prefers HTTP + WS combo.
    The analysis_id can be used to correlate WS messages.
    """
    analysis_id = str(uuid.uuid4())
    logger.info("Analysis %s started with %d satellites", analysis_id, len(request.satellites))

    # Store the request so the WebSocket handler can pick it up
    from app.routes.websocket import pending_analyses
    pending_analyses[analysis_id] = request.satellites

    return AnalyzeResponse(analysis_id=analysis_id, status="started")
