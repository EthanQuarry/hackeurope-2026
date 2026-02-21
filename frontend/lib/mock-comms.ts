import type { CommsTranscription } from "@/types"

/**
 * Returns a realistic mock CommsTranscription for demo/fallback.
 * Used when the backend is unavailable.
 */
export function getMockCommsTranscription(humanInput: string): CommsTranscription {
  return {
    transcription_id: `mock-${Date.now()}`,
    timestamp: Date.now() / 1000,
    human_input: humanInput,
    parsed_intent: {
      command_type: "orbit_adjust",
      target_satellite_id: "sat-6",
      target_satellite_name: "USA-245 (NROL-65)",
      parameters: {
        maneuver_type: "collision_avoidance",
        delta_v_ms: 0.15,
        burn_direction: "anti-velocity",
        reference_threat: "SJ-26 (SHIJIAN-26)",
      },
      urgency: "urgent",
      summary:
        "Execute collision avoidance maneuver on USA-245 — 0.15 m/s anti-velocity burn to increase separation from SJ-26",
    },
    at_commands: {
      commands: [
        {
          command: "AT+CSQF",
          description: "Query Iridium signal strength (0-5 bars)",
          expected_response: "+CSQF:4",
        },
        {
          command: "AT+SBDD2",
          description: "Clear both MO and MT message buffers",
          expected_response: "0",
        },
        {
          command: "AT+SBDWB=47",
          description: "Write 47-byte binary payload to MO buffer",
          expected_response: "READY\\r\\n0",
        },
        {
          command:
            "[Binary: 01 00 2F 41 00 15 A3 B7 C2 01 33 30 30 32 33 34 30 31 30 31 32 33 34 35 36 00 00 42 00 0F 10 01 00 00 00 96 02 F1 FF FF FF FF 00 00 00 00 + checksum]",
          description: "Raw SBD MT binary payload with 2-byte checksum appended",
          expected_response: "0",
        },
        {
          command: "AT+SBDIX",
          description:
            "Initiate SBD session — transmit MO message via Iridium constellation and check for MT response",
          expected_response: "+SBDIX: 0,42,0,0,0,0",
        },
      ],
      total_commands: 5,
      estimated_duration_ms: 18000,
    },
    sbd_payload: {
      protocol_revision: 1,
      overall_message_length: 47,
      mt_header_iei: "0x41",
      mt_header_length: 21,
      unique_client_message_id: "A3B7C201",
      imei: "300234010123456",
      mt_disposition_flags: "0x0000",
      mt_payload_iei: "0x42",
      mt_payload_length: 15,
      mt_payload_hex:
        "01 00 2F 41 00 15 A3 B7 C2 01 33 30 30 32 33 34 30 31 30 31 32 33 34 35 36 00 00 42 00 0F 10 01 00 00 00 96 02 F1 FF FF FF FF 00 00 00 00",
      mt_payload_human_readable:
        "ORBIT_ADJUST command (opcode 0x10): anti-velocity burn, delta-V 0.15 m/s, for collision avoidance. Target IMEI 300234010123456 (USA-245).",
      total_bytes: 47,
    },
    gateway_routing: {
      selected_gateway: {
        name: "SNOC Tempe",
        location: "Tempe, Arizona, USA",
        lat: 33.4255,
        lon: -111.94,
        region: "North America",
        status: "operational",
      },
      routing_reason:
        "Satellite sub-point (35.2N, -80.4E) is 2847 km from SNOC Tempe (Tempe, Arizona, USA). Selected as nearest operational gateway via 1 inter-satellite link hop(s).",
      satellite_position: { lat: 35.2, lon: -80.4, altKm: 500 },
      signal_hops: 1,
      estimated_latency_ms: 217,
      alternative_gateways: [
        {
          name: "SNOC Svalbard",
          location: "Svalbard, Norway",
          lat: 78.23,
          lon: 15.63,
          region: "Europe / Arctic",
          status: "operational",
        },
        {
          name: "TT&C Fairbanks",
          location: "Fairbanks, Alaska, USA",
          lat: 64.8378,
          lon: -147.7164,
          region: "North America / Arctic",
          status: "operational",
        },
      ],
    },
    agent_reasoning:
      "The operator requests a collision avoidance maneuver for USA-245 to avoid approaching SJ-26. Given SJ-26's co-orbital approach pattern and assessed hostile intent, an urgent anti-velocity burn of 0.15 m/s is prescribed to increase separation distance. The command is encoded as an ORBIT_ADJUST (opcode 0x10) SBD message targeting USA-245's Iridium modem (IMEI 300234010123456).",
    status: "complete",
  }
}
