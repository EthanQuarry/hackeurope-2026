from __future__ import annotations

import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# --- Satellite data (matches frontend structure) ---

class SatelliteData(BaseModel):
    id: int
    name: str | None = None
    a: float = Field(description="Semi-major axis")
    inc: float = Field(description="Inclination (radians)")
    raan: float = Field(description="Right ascension of ascending node (radians)")
    e: float = Field(description="Eccentricity")
    speed: float = Field(description="Angular speed")
    anomaly: float = Field(description="True anomaly (radians)")


class AnalyzeRequest(BaseModel):
    satellites: list[SatelliteData]


# --- Threat analysis output ---

class ThreatType(str, Enum):
    COLLISION = "collision"
    DEBRIS = "debris"
    KINETIC = "kinetic"
    INTERCEPTION = "interception"
    PROXIMITY = "proximity"
    MANEUVER = "maneuver"
    ANOMALY = "anomaly"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ThreatFlag(BaseModel):
    satellite_id: int
    satellite_name: str | None = None
    threat_type: ThreatType
    severity: Severity
    details: str
    related_satellite_id: int | None = None


# --- Historical research output ---

class HistoricalRecord(BaseModel):
    satellite_id: int
    name: str
    owner: str
    nation: str
    purpose: str
    source: str
    attack_likelihood: float = Field(description="0.0 - 1.0 probability of hostile intent", ge=0, le=1)
    historical_precedents: list[str] = []
    risk_factors: list[str] = []
    notes: str = ""


# --- Final report ---

class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ThreatReport(BaseModel):
    analysis_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    overall_risk_level: RiskLevel
    physical_threats: list[ThreatFlag] = []
    interception_threats: list[ThreatFlag] = []
    historical_assessments: list[HistoricalRecord] = []
    assessment_summary: str
    recommended_actions: list[str] = []
    geopolitical_notes: str = ""


# --- WebSocket message ---

class WSMessageType(str, Enum):
    AGENT_START = "agent_start"
    AGENT_PROGRESS = "agent_progress"
    AGENT_COMPLETE = "agent_complete"
    PIPELINE_COMPLETE = "pipeline_complete"
    ERROR = "error"


class WSMessage(BaseModel):
    type: WSMessageType
    agent_name: str | None = None
    data: Any = None


# --- API responses ---

class AnalyzeResponse(BaseModel):
    analysis_id: str
    status: str = "started"


class HealthResponse(BaseModel):
    status: str = "ok"
