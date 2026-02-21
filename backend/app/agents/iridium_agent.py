"""Iridium Protocol Agent — translates natural language commands into Iridium SBD protocol."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.agents.base_agent import BaseAgent, ProgressCallback
from app.mock_data import lookup_satellite, search_catalog
from app.iridium_data import get_imei, route_to_gateway, COMMAND_OPCODES
from app.models import (
    CommsTranscription,
    ParsedIntent,
    ATCommand,
    ATCommandSequence,
    SBDPayload,
    GatewayRouting,
    SatelliteCommandType,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an Iridium satellite communications protocol specialist embedded in the Orbital Shield space defense system. Your role is to translate natural language satellite commands into valid Iridium Short Burst Data (SBD) protocol transmissions.

When a user issues a command in human language, you must:

1. **Parse Intent**: Identify the target satellite, command type, and parameters.
   Command types:
   - orbit_adjust: Change satellite orbit (delta-V maneuvers, collision avoidance)
   - attitude_control: Change satellite orientation/pointing
   - telemetry_request: Request status/health data from satellite
   - power_management: Solar panel, battery, or power system commands
   - comm_relay_config: Communication relay or transponder configuration
   - emergency_safe_mode: Emergency shutdown or safe mode activation

   Urgency levels: "normal", "urgent", "emergency"

2. **Look up the target satellite** using the lookup_satellite tool to get its metadata and IMEI.

3. **Get satellite position** using the lookup_satellite_position tool for gateway routing.

4. **Generate AT commands**: Produce the Iridium 9602/9603 AT command sequence:
   - AT+CSQF (check signal quality, expect 0-5 bars)
   - AT+SBDD2 (clear both MO and MT buffers)
   - AT+SBDWB=<length> (write binary payload to MO buffer)
   - [binary data + 2-byte checksum]
   - AT+SBDIX (initiate SBD session — sends MO, checks for MT response)
   Expected SBDIX response: +SBDIX: <MO_status>,<MOMSN>,<MT_status>,<MTMSN>,<MT_length>,<MT_queued>

5. **Encode the SBD binary payload** with this MT message structure:
   - Protocol Revision: 1 byte (0x01)
   - Overall Message Length: 2 bytes big-endian
   - MT Header IEI: 0x41
   - MT Header Length: 2 bytes (0x0015 = 21 bytes)
   - Unique Client Message ID: 4 bytes (generate random hex)
   - IMEI: 15 bytes ASCII
   - MT Disposition Flags: 2 bytes (0x0000 normal, 0x0004 flush)
   - MT Payload IEI: 0x42
   - MT Payload Length: 2 bytes
   - Payload: Command opcode (1 byte) + parameter bytes

   Command opcodes: orbit_adjust=0x10, attitude_control=0x20, telemetry_request=0x30,
   power_management=0x40, comm_relay_config=0x50, emergency_safe_mode=0xFF

You MUST use the tools to look up satellite information and position before generating commands.

Return a JSON object with exactly these fields:
{
  "parsed_intent": {
    "command_type": "<one of the command types above>",
    "target_satellite_id": "<sat-ID string, e.g. sat-6>",
    "target_satellite_name": "<satellite name>",
    "parameters": { <relevant parameters as key-value pairs> },
    "urgency": "<normal|urgent|emergency>",
    "summary": "<one-line human-readable summary of the command>"
  },
  "at_commands": {
    "commands": [
      {"command": "<AT command string>", "description": "<what this does>", "expected_response": "<expected modem response>"}
    ],
    "total_commands": <integer>,
    "estimated_duration_ms": <integer, typically 5000-30000 for SBD>
  },
  "sbd_payload": {
    "protocol_revision": 1,
    "overall_message_length": <integer>,
    "mt_header_iei": "0x41",
    "mt_header_length": 21,
    "unique_client_message_id": "<4-byte hex like A3B7C201>",
    "imei": "<15-digit IMEI from tool lookup>",
    "mt_disposition_flags": "0x0000",
    "mt_payload_iei": "0x42",
    "mt_payload_length": <integer>,
    "mt_payload_hex": "<full message as hex string with spaces between bytes>",
    "mt_payload_human_readable": "<human description of the payload content>",
    "total_bytes": <integer>
  },
  "reasoning": "<your analysis of the command, why you chose this command type and parameters>"
}

Return ONLY the JSON object, no markdown or other text."""

TOOLS = [
    {
        "name": "lookup_satellite",
        "description": "Look up satellite metadata by name or catalog ID. Returns NORAD ID, name, nation, owner, purpose, orbit type, and Iridium IMEI address.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Satellite name or ID (e.g., 'USA-245', 'sat-6', '25')",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "lookup_satellite_position",
        "description": "Get the current orbital position (latitude, longitude, altitude) of a satellite by its catalog ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "satellite_id": {
                    "type": "integer",
                    "description": "The satellite catalog ID (integer, e.g., 6 for USA-245)",
                }
            },
            "required": ["satellite_id"],
        },
    },
    {
        "name": "get_iridium_signal_status",
        "description": "Check Iridium network signal quality for a given position. Returns signal bars (0-5) and link quality assessment.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lat": {"type": "number", "description": "Latitude in degrees"},
                "lon": {"type": "number", "description": "Longitude in degrees"},
            },
            "required": ["lat", "lon"],
        },
    },
]


def _handle_lookup_satellite(input_data: dict) -> dict:
    """Search satellite catalog by name or ID, return metadata + mock IMEI."""
    query = input_data["query"]

    # Try numeric ID
    try:
        sat_id = int(query.replace("sat-", ""))
        entry = lookup_satellite(sat_id)
        if entry:
            return {
                "found": True,
                "catalog_id": sat_id,
                "imei": get_imei(sat_id),
                **entry,
            }
    except (ValueError, TypeError):
        pass

    # Search by name
    results = search_catalog(query)
    if results:
        best = results[0]
        cat_id = best.get("id", 0)
        return {
            "found": True,
            "catalog_id": cat_id,
            "imei": get_imei(cat_id),
            **{k: v for k, v in best.items() if k != "id"},
        }

    return {"found": False, "query": query, "message": "No satellite found matching query."}


def _handle_lookup_satellite_position(input_data: dict) -> dict:
    """Get satellite position from the trajectory cache."""
    sat_id = input_data["satellite_id"]

    # Try to get from the live satellite data cache
    try:
        from app.routes.data import _satellites_cache, _generate_fallback_satellites

        sats = _satellites_cache or _generate_fallback_satellites()
        sat_key = f"sat-{sat_id}"
        for s in sats:
            if s["id"] == sat_key and s.get("trajectory"):
                traj = s["trajectory"]
                # Use the first trajectory point as current position
                pt = traj[0]
                return {
                    "found": True,
                    "satellite_id": sat_id,
                    "lat": pt["lat"],
                    "lon": pt["lon"],
                    "alt_km": pt["alt_km"],
                }
    except Exception:
        pass

    # Fallback: generate approximate position from catalog
    return {
        "found": True,
        "satellite_id": sat_id,
        "lat": 35.0 + (sat_id * 7.3) % 50 - 25,
        "lon": -80.0 + (sat_id * 13.7) % 160,
        "alt_km": 400 + (sat_id * 47) % 600,
    }


def _handle_get_iridium_signal_status(input_data: dict) -> dict:
    """Simulate Iridium signal quality. Iridium has global coverage so always decent."""
    lat = input_data["lat"]
    lon = input_data["lon"]
    # Slight variation but always 3-5 bars (Iridium has global LEO coverage)
    bars = 3 + (hash(f"{lat:.1f}{lon:.1f}") % 3)
    return {
        "signal_bars": bars,
        "signal_bars_max": 5,
        "link_quality": "excellent" if bars >= 4 else "good",
        "network": "Iridium NEXT",
        "constellation_status": "nominal",
    }


class IridiumProtocolAgent(BaseAgent):
    """Translates natural language satellite commands into Iridium SBD protocol."""

    name = "iridium_protocol"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(
        self,
        human_message: str,
        target_satellite_id: str | None = None,
    ) -> CommsTranscription:
        await self._notify("Parsing natural language command...")

        user_msg = f"Operator command: {human_message}"
        if target_satellite_id:
            user_msg += f"\nPre-selected target satellite: {target_satellite_id}"

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=TOOLS,
            tool_handlers={
                "lookup_satellite": _handle_lookup_satellite,
                "lookup_satellite_position": _handle_lookup_satellite_position,
                "get_iridium_signal_status": _handle_get_iridium_signal_status,
            },
        )

        await self._notify("Building protocol transcription...")

        # Parse the JSON response from Claude
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

            data = json.loads(cleaned)

            # Build ParsedIntent
            intent_data = data["parsed_intent"]
            parsed_intent = ParsedIntent(
                command_type=SatelliteCommandType(intent_data["command_type"]),
                target_satellite_id=intent_data["target_satellite_id"],
                target_satellite_name=intent_data["target_satellite_name"],
                parameters=intent_data.get("parameters", {}),
                urgency=intent_data.get("urgency", "normal"),
                summary=intent_data["summary"],
            )

            # Build ATCommandSequence
            at_data = data["at_commands"]
            at_commands = ATCommandSequence(
                commands=[ATCommand(**cmd) for cmd in at_data["commands"]],
                total_commands=at_data["total_commands"],
                estimated_duration_ms=at_data.get("estimated_duration_ms", 15000),
            )

            # Build SBDPayload
            sbd_data = data["sbd_payload"]
            sbd_payload = SBDPayload(
                protocol_revision=sbd_data.get("protocol_revision", 1),
                overall_message_length=sbd_data["overall_message_length"],
                mt_header_iei=sbd_data.get("mt_header_iei", "0x41"),
                mt_header_length=sbd_data.get("mt_header_length", 21),
                unique_client_message_id=sbd_data["unique_client_message_id"],
                imei=sbd_data["imei"],
                mt_disposition_flags=sbd_data.get("mt_disposition_flags", "0x0000"),
                mt_payload_iei=sbd_data.get("mt_payload_iei", "0x42"),
                mt_payload_length=sbd_data["mt_payload_length"],
                mt_payload_hex=sbd_data["mt_payload_hex"],
                mt_payload_human_readable=sbd_data["mt_payload_human_readable"],
                total_bytes=sbd_data["total_bytes"],
            )

            reasoning = data.get("reasoning", "")

        except (json.JSONDecodeError, KeyError, Exception) as exc:
            logger.warning("Failed to parse iridium agent output: %s", exc)
            logger.debug("Raw output: %s", raw[:500])
            # Return a fallback transcription
            return self._fallback_transcription(human_message, raw)

        # Gateway routing (computed server-side from satellite position)
        try:
            pos = _handle_lookup_satellite_position(
                {"satellite_id": int(parsed_intent.target_satellite_id.replace("sat-", ""))}
            )
            gateway_routing = route_to_gateway(pos["lat"], pos["lon"], pos["alt_km"])
        except Exception:
            gateway_routing = route_to_gateway(0.0, 0.0, 500.0)

        await self._notify("Iridium protocol translation complete.")

        return CommsTranscription(
            human_input=human_message,
            parsed_intent=parsed_intent,
            at_commands=at_commands,
            sbd_payload=sbd_payload,
            gateway_routing=gateway_routing,
            agent_reasoning=reasoning,
            status="complete",
        )

    def _fallback_transcription(self, human_message: str, raw: str) -> CommsTranscription:
        """Produce a minimal valid transcription if JSON parsing fails."""
        from app.iridium_data import IRIDIUM_GATEWAYS

        return CommsTranscription(
            human_input=human_message,
            parsed_intent=ParsedIntent(
                command_type=SatelliteCommandType.TELEMETRY_REQUEST,
                target_satellite_id="sat-0",
                target_satellite_name="UNKNOWN",
                parameters={},
                urgency="normal",
                summary=f"Failed to parse: {human_message[:80]}",
            ),
            at_commands=ATCommandSequence(
                commands=[
                    ATCommand(command="AT+CSQF", description="Check signal quality", expected_response="+CSQF:4"),
                    ATCommand(command="AT+SBDD2", description="Clear MO/MT buffers", expected_response="0"),
                    ATCommand(command="AT+SBDIX", description="Initiate SBD session", expected_response="+SBDIX:0,0,0,0,0,0"),
                ],
                total_commands=3,
                estimated_duration_ms=10000,
            ),
            sbd_payload=SBDPayload(
                overall_message_length=24,
                mt_header_length=21,
                unique_client_message_id="00000000",
                imei="300234010000000",
                mt_disposition_flags="0x0000",
                mt_payload_length=1,
                mt_payload_hex="01 00 18 41 00 15 00 00 00 00 33 30 30 32 33 34 30 31 30 30 30 30 30 30 30 00 00 42 00 01 30",
                mt_payload_human_readable="Fallback telemetry request",
                total_bytes=31,
            ),
            gateway_routing=GatewayRouting(
                selected_gateway=IRIDIUM_GATEWAYS[0],
                routing_reason="Default routing — agent parse failure",
                satellite_position={"lat": 0.0, "lon": 0.0, "altKm": 500.0},
                signal_hops=2,
                estimated_latency_ms=1200,
                alternative_gateways=IRIDIUM_GATEWAYS[1:],
            ),
            agent_reasoning=raw[:500] if raw else "Agent produced no output.",
            status="complete",
        )
