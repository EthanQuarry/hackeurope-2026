"use client"

import { useCallback, useRef } from "react"
import { useAgentOpsStore } from "@/stores/agent-ops-store"
import type { AgentFlowStepId, AgentResponseOption } from "@/types"

/* ── Helpers ──────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Random integer between min and max (inclusive) */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Random delay between thinking lines (300-800ms) */
function thinkDelay(): Promise<void> {
  return sleep(randInt(300, 800))
}

/** Random delay between steps (500-1000ms) */
function stepDelay(): Promise<void> {
  return sleep(randInt(500, 1000))
}

/* ── Simulation params ────────────────────────────────── */

interface SimulationParams {
  satelliteId: string
  satelliteName: string
  threatSatelliteId: string
  threatSatelliteName: string
  triggerRisk: number
  triggerReason: string
  threatData: {
    missDistanceKm?: number
    approachPattern?: string
    tcaMinutes?: number
    countryCode?: string
    anomalyType?: string
  }
}

/* ── Country code helpers ─────────────────────────────── */

const COUNTRY_NAMES: Record<string, string> = {
  CN: "People's Republic of China",
  RU: "Russian Federation",
  IR: "Islamic Republic of Iran",
  KP: "Democratic People's Republic of Korea",
  US: "United States of America",
  IN: "Republic of India",
  FR: "French Republic",
  UK: "United Kingdom",
  JP: "Japan",
}

function countryName(code?: string): string {
  if (!code) return "Unknown State Actor"
  return COUNTRY_NAMES[code.toUpperCase()] ?? `State Actor (${code})`
}

/* ── Hook ─────────────────────────────────────────────── */

export function useAgentSimulation() {
  const abortedRef = useRef(false)

  const store = useAgentOpsStore()

  /** Convenience: add a thinking line and wait */
  async function think(
    stepId: AgentFlowStepId,
    type: "reasoning" | "tool" | "result" | "warning" | "data",
    text: string,
  ) {
    if (abortedRef.current) return
    useAgentOpsStore.getState().addThinkingLine(stepId, { type, text })
    await thinkDelay()
  }

  /** Check if aborted — throws to break out of the pipeline */
  function checkAbort() {
    if (abortedRef.current) throw new Error("__AGENT_ABORTED__")
  }

  /* ── Step runners ───────────────────────────────────── */

  async function runStep1(params: SimulationParams) {
    const stepId: AgentFlowStepId = "threshold-breach"
    const threshold = useAgentOpsStore.getState().threshold
    const riskPct = (params.triggerRisk * 100).toFixed(1)
    const threshPct = (threshold * 100).toFixed(0)
    const country = params.threatData.countryCode

    useAgentOpsStore.getState().activateStep(stepId)
    checkAbort()

    await think(stepId, "reasoning", `ALERT: Risk threshold crossed for ${params.satelliteName}`)
    checkAbort()
    await think(stepId, "data", `Current risk level: ${riskPct}% (threshold: ${threshPct}%)`)
    checkAbort()
    await think(stepId, "data", `Trigger cause: ${params.triggerReason}`)
    checkAbort()
    await think(stepId, "tool", "Querying threat database for satellite pair...")
    checkAbort()
    await sleep(randInt(400, 800))
    checkAbort()
    await think(stepId, "result", `Identified threat actor: ${params.threatSatelliteName} (${country ?? "UNK"})`)
    checkAbort()
    await think(stepId, "reasoning", "Initiating autonomous response protocol...")

    useAgentOpsStore.getState().completeStep(
      stepId,
      `Threshold breach confirmed at ${riskPct}% risk. Threat actor: ${params.threatSatelliteName}. Beginning deep analysis.`,
    )
  }

  async function runStep2(params: SimulationParams) {
    const stepId: AgentFlowStepId = "deep-research-target"
    const missKm = params.threatData.missDistanceKm ?? 25
    const propellant = randInt(40, 95)
    const power = randInt(70, 100)
    const comms = randInt(80, 100)

    useAgentOpsStore.getState().activateStep(stepId)
    checkAbort()

    await think(stepId, "tool", `Querying orbital parameters for ${params.satelliteName}...`)
    checkAbort()
    await think(stepId, "result", `Orbit: LEO ${randInt(350, 800)}km, inclination ${randInt(40, 98)}.${randInt(0, 9)}deg, period ${randInt(88, 100)}min`)
    checkAbort()
    await think(stepId, "tool", "Checking onboard health systems...")
    checkAbort()
    await think(stepId, "data", `Power subsystem: ${power}% nominal | Comms: ${comms}% nominal | Propellant: ${propellant}% remaining`)
    checkAbort()
    await think(stepId, "reasoning", `Propellant reserves ${propellant >= 60 ? "sufficient" : "limited"} for evasive maneuver if required`)
    checkAbort()
    await think(stepId, "tool", "Assessing current mission status and operational commitments...")
    checkAbort()
    await think(stepId, "result", `Mission status: ACTIVE — imagery collection window in ${randInt(5, 45)} minutes`)
    checkAbort()
    await think(stepId, "tool", "Evaluating maneuver delta-V budget...")
    checkAbort()
    await think(stepId, "data", `Available delta-V: ${(propellant * 0.8).toFixed(1)} m/s — ${propellant >= 60 ? "multiple maneuvers possible" : "single maneuver budget only"}`)
    checkAbort()
    await think(stepId, "tool", "Scanning for nearby friendly assets within 200km corridor...")
    checkAbort()
    await think(stepId, "result", `${randInt(0, 3)} allied assets detected in orbital neighborhood. Relay capability: ${randInt(0, 1) ? "available" : "unavailable"}`)

    useAgentOpsStore.getState().completeStep(
      stepId,
      `${params.satelliteName} is operational with ${propellant}% propellant. ${propellant >= 60 ? "Full maneuver capability." : "Limited maneuver budget."} Current separation from threat: ${missKm.toFixed(1)}km.`,
    )
  }

  async function runStep3(params: SimulationParams) {
    const stepId: AgentFlowStepId = "deep-research-threat"
    const country = params.threatData.countryCode
    const approach = params.threatData.approachPattern ?? "co-orbital"
    const tcaMin = params.threatData.tcaMinutes ?? randInt(10, 90)

    useAgentOpsStore.getState().activateStep(stepId)
    checkAbort()

    await think(stepId, "tool", `Identifying origin and operator of ${params.threatSatelliteName}...`)
    checkAbort()
    await think(stepId, "result", `Operator: ${countryName(country)} — Military/Intelligence classification probable`)
    checkAbort()
    await think(stepId, "tool", "Checking historical behavior patterns from ELINT database...")
    checkAbort()
    await think(stepId, "data", `${randInt(2, 12)} prior close-approach events logged. ${randInt(1, 5)} involved RPO maneuvers within 50km.`)
    checkAbort()
    await think(stepId, "tool", "Analyzing current trajectory and approach vector...")
    checkAbort()
    await think(stepId, "result", `Approach pattern classified as "${approach}" — TCA in ${tcaMin} minutes`)
    checkAbort()
    await think(stepId, "tool", "Cross-referencing with known ASAT/inspection satellite database...")
    checkAbort()
    await think(stepId, "data", `Match confidence: ${randInt(70, 98)}% — satellite consistent with known inspection/proximity operations platform`)
    checkAbort()
    await think(stepId, "tool", "Evaluating electronic warfare and RF interference capability...")
    checkAbort()
    await think(stepId, "result", `EW capability assessment: ${params.triggerRisk > 0.7 ? "HIGH — active RF emission detected on approach" : "MODERATE — passive sensors only confirmed"}`)
    checkAbort()
    await think(stepId, "reasoning", `Threat actor ${params.threatSatelliteName} shows deliberate approach profile consistent with intelligence-gathering or pre-positioning for ASAT engagement`)

    useAgentOpsStore.getState().completeStep(
      stepId,
      `${params.threatSatelliteName} (${country ?? "UNK"}) identified as probable ${params.triggerRisk > 0.7 ? "military inspection/ASAT" : "intelligence-gathering"} platform. Approach: ${approach}, TCA: ${tcaMin}min.`,
    )
  }

  async function runStep4(params: SimulationParams) {
    const stepId: AgentFlowStepId = "geopolitical-analysis"
    const country = params.threatData.countryCode
    const cName = countryName(country)

    useAgentOpsStore.getState().activateStep(stepId)
    checkAbort()

    await think(stepId, "tool", `Querying current diplomatic status with ${cName}...`)
    checkAbort()
    await think(stepId, "data", `Diplomatic relations: ${params.triggerRisk > 0.7 ? "STRAINED — recent sanctions and military posturing" : "TENSE — ongoing strategic competition"}`)
    checkAbort()
    await think(stepId, "tool", "Checking recent military exercises and force deployments in region...")
    checkAbort()
    await think(stepId, "result", `${randInt(1, 4)} active military exercises detected in adjacent theater. Space domain activity: ELEVATED`)
    checkAbort()
    await think(stepId, "tool", "Assessing current DEFCON and SPACECOM readiness level...")
    checkAbort()
    await think(stepId, "data", `USSPACECOM readiness: ${params.triggerRisk > 0.8 ? "ENHANCED (Level 2)" : "NORMAL (Level 3)"}. No active DEFCON escalation.`)
    checkAbort()
    await think(stepId, "tool", "Evaluating allied asset proximity and coalition posture...")
    checkAbort()
    await think(stepId, "result", `${randInt(2, 8)} allied space assets in co-orbital regime. Five Eyes intelligence sharing: ACTIVE`)
    checkAbort()
    await think(stepId, "tool", "Cross-referencing with latest intelligence briefings...")
    checkAbort()
    await think(stepId, "result", `Recent SIGINT indicates ${params.triggerRisk > 0.7 ? "increased encrypted communications between threat operator ground stations" : "routine telemetry exchanges with operator ground segment"}`)

    const context = `Geopolitical context: Relations with ${cName} are ${params.triggerRisk > 0.7 ? "strained" : "tense"}. Regional military activity is elevated. Allied space infrastructure is ${randInt(0, 1) ? "well-positioned for mutual support" : "partially available for coordination"}.`

    useAgentOpsStore.getState().setGeopoliticalContext(context)
    useAgentOpsStore.getState().completeStep(stepId, context)
  }

  async function runStep5(params: SimulationParams) {
    const stepId: AgentFlowStepId = "threat-assessment"
    const risk = params.triggerRisk
    const bayesianProb = Math.min(0.99, risk + (Math.random() * 0.1 - 0.05)).toFixed(2)

    useAgentOpsStore.getState().activateStep(stepId)
    checkAbort()

    await think(stepId, "tool", "Computing Bayesian threat probability from accumulated evidence...")
    checkAbort()
    await think(stepId, "data", `Prior probability: ${(risk * 0.8).toFixed(2)} | Evidence update: +${(Math.random() * 0.15).toFixed(2)} | Posterior: ${bayesianProb}`)
    checkAbort()
    await think(stepId, "reasoning", `Evaluating intent indicators: approach pattern, timing, orbital mechanics, historical precedent...`)
    checkAbort()
    await think(stepId, "data", `Intent score: ${(risk * 100).toFixed(0)}/100 — ${risk > 0.7 ? "DELIBERATE approach with high confidence" : "Ambiguous — could be coincidental orbital mechanics"}`)
    checkAbort()
    await think(stepId, "tool", "Assessing potential damage to intelligence collection capability...")
    checkAbort()
    await think(stepId, "result", `Impact if asset compromised: ${risk > 0.7 ? "SEVERE — coverage gap in critical region for 72+ hours" : "MODERATE — backup assets can partially compensate within 24 hours"}`)
    checkAbort()
    await think(stepId, "tool", "Rating urgency and time-to-impact...")
    checkAbort()
    await think(stepId, "data", `Urgency: ${risk > 0.8 ? "IMMEDIATE — maneuver window closing" : risk > 0.6 ? "HIGH — action needed within current orbit" : "MODERATE — multiple orbits available for response"}`)
    checkAbort()

    // Determine threat level
    let threatLevel: "low" | "medium" | "high" | "critical"
    if (risk > 0.8) threatLevel = "critical"
    else if (risk > 0.6) threatLevel = "high"
    else if (risk > 0.4) threatLevel = "medium"
    else threatLevel = "low"

    await think(stepId, "result", `FINAL THREAT CLASSIFICATION: ${threatLevel.toUpperCase()}`)

    useAgentOpsStore.getState().setThreatLevel(threatLevel)
    useAgentOpsStore.getState().completeStep(
      stepId,
      `Threat classified as ${threatLevel.toUpperCase()}. Bayesian probability: ${bayesianProb}. ${risk > 0.7 ? "Deliberate hostile approach confirmed." : "Intent remains ambiguous but precautionary action warranted."}`,
    )
  }

  async function runStep6(params: SimulationParams) {
    const stepId: AgentFlowStepId = "response-selection"
    const risk = params.triggerRisk
    const missKm = params.threatData.missDistanceKm ?? 25
    const approach = params.threatData.approachPattern ?? "co-orbital"
    const tcaMin = params.threatData.tcaMinutes ?? randInt(10, 90)
    const threatLevel = useAgentOpsStore.getState().activeSession?.threatLevel ?? "medium"

    useAgentOpsStore.getState().activateStep(stepId)
    checkAbort()

    await think(stepId, "reasoning", "Evaluating 4 response protocols against current threat profile...")
    checkAbort()

    // Build the 4 response options
    const manoeuvre: AgentResponseOption = {
      tier: "manoeuvre",
      label: "Defensive Orbit Manoeuvre",
      description: `Execute a ${(1.5 + Math.random() * 3).toFixed(1)} m/s delta-V burn to raise orbit by ${randInt(5, 20)}km, increasing separation from ${params.threatSatelliteName}. Maintains current mission coverage with minimal disruption.`,
      severity: 1,
      justification: `Standard defensive response to ${approach} approach. Increases miss distance from ${missKm.toFixed(1)}km to ${(missKm + randInt(15, 50)).toFixed(1)}km while preserving mission capability.`,
      confidence: 0.92,
      risks: [
        `Propellant expenditure reduces remaining delta-V budget by ~${randInt(5, 15)}%`,
        "Temporary loss of optimal imaging geometry for 2-3 orbits",
        "Maneuver is observable and confirms asset operational status to adversary",
      ],
      benefits: [
        "No escalation — purely defensive posture",
        "Maintains full mission coverage within 4 hours",
        "Fully reversible with follow-up correction burn",
        "Established precedent in SSA protocols",
      ],
      estimatedTimeMin: randInt(8, 25),
      deltaVMs: parseFloat((1.5 + Math.random() * 3).toFixed(1)),
      recommended: false,
    }

    const sarcasticManoeuvre: AgentResponseOption = {
      tier: "sarcastic-manoeuvre",
      label: "Assertive Mirror Manoeuvre",
      description: `Mirror ${params.threatSatelliteName}'s orbital adjustments with a deliberate ${(2.0 + Math.random() * 4).toFixed(1)} m/s counter-maneuver. Signal awareness and capability by maintaining proportional relative geometry.`,
      severity: 2,
      justification: `Demonstrates real-time space domain awareness and maneuver capability. Historical analysis shows mirror maneuvers deter further approach in ${randInt(60, 80)}% of cases.`,
      confidence: 0.78,
      risks: [
        "Could be interpreted as aggressive posturing by adversary",
        "Higher propellant cost than simple avoidance",
        "May trigger adversary counter-maneuver escalation cycle",
        "Requires continuous tracking to maintain mirror geometry",
      ],
      benefits: [
        "Demonstrates capability without kinetic action",
        "Strong deterrent effect on further approach",
        "Psychological pressure on adversary operator",
        "Maintains orbital proximity for continued monitoring",
      ],
      estimatedTimeMin: randInt(15, 40),
      deltaVMs: parseFloat((2.0 + Math.random() * 4).toFixed(1)),
      recommended: false,
    }

    const decoy: AgentResponseOption = {
      tier: "decoy",
      label: "Decoy Deployment & Reposition",
      description: `Deploy ${randInt(2, 4)} radar-reflective decoy objects at current orbital position while executing a covert ${(3.0 + Math.random() * 5).toFixed(1)} m/s reposition burn. Creates ambiguity in adversary tracking.`,
      severity: 3,
      justification: `Decoy deployment creates ${randInt(3, 6)} false targets in adversary tracking system, buying ${randInt(4, 12)} hours for strategic repositioning. Effective against ${approach} approach pattern.`,
      confidence: 0.71,
      risks: [
        `Increases orbital debris count by ${randInt(2, 4)} trackable objects`,
        "Reveals decoy deployment capability to adversary intelligence",
        "Possible violation of debris mitigation guidelines",
        "May trigger escalated response from adversary",
      ],
      benefits: [
        "Protects real asset identity and position",
        "Creates significant tracking ambiguity for adversary",
        `Buys ${randInt(4, 12)} hours for strategic decision-making`,
        "Enables covert repositioning under cover of decoy cloud",
      ],
      estimatedTimeMin: randInt(20, 50),
      deltaVMs: parseFloat((3.0 + Math.random() * 5).toFixed(1)),
      recommended: false,
    }

    const destroy: AgentResponseOption = {
      tier: "destroy",
      label: "Kinetic Neutralization",
      description: `Engage ${params.threatSatelliteName} with directed-energy or kinetic interceptor to permanently neutralize the threat. EXTREME MEASURE — authorization from National Command Authority required.`,
      severity: 4,
      justification: `Only justified if ${params.threatSatelliteName} poses imminent, confirmed threat to critical national security infrastructure with no alternative mitigation available. Current TCA: ${tcaMin}min.`,
      confidence: 0.45,
      risks: [
        `Generates debris field of ${randInt(500, 3000)}+ trackable fragments endangering all LEO assets`,
        "International incident with potential military escalation",
        "Violation of Outer Space Treaty Article IX",
        "Potential cascade effect (Kessler syndrome risk)",
        "Severe diplomatic consequences — possible WW3 escalation trigger",
      ],
      benefits: [
        "Permanently eliminates the immediate threat",
        "Demonstrates decisive ASAT capability as deterrent",
      ],
      estimatedTimeMin: randInt(3, 10),
      deltaVMs: 0,
      recommended: false,
    }

    // Evaluate each option with thinking lines
    await think(stepId, "reasoning", `Option 1 — DEFENSIVE MANOEUVRE: Low severity, high confidence. ${threatLevel === "critical" ? "Insufficient for threat level." : "Safe and reversible approach."}`)
    checkAbort()
    await think(stepId, "reasoning", `Option 2 — MIRROR MANOEUVRE: Moderate severity. ${threatLevel === "high" || threatLevel === "critical" ? "Demonstrates capability but risks escalation." : "Disproportionate to current threat level."}`)
    checkAbort()
    await think(stepId, "reasoning", `Option 3 — DECOY DEPLOYMENT: Elevated severity. ${threatLevel === "critical" || threatLevel === "high" ? "Effective protection with acceptable risk trade-off." : "Debris generation not justified at this threat level."}`)
    checkAbort()
    await think(stepId, "warning", `Option 4 — KINETIC NEUTRALIZATION: Maximum severity. ${threatLevel === "critical" ? "Available but NOT recommended without NCA authorization. Escalation risk unacceptable." : "NOT RECOMMENDED — threat level does not warrant kinetic response."}`)
    checkAbort()

    // Determine recommended option
    let recommended: AgentResponseOption
    if (threatLevel === "critical") {
      recommended = decoy
      await think(stepId, "reasoning", "CRITICAL threat level — recommending DECOY DEPLOYMENT. Kinetic option available but escalation risk prohibitive without explicit NCA authorization.")
    } else if (threatLevel === "high") {
      // Randomly pick sarcastic-manoeuvre or decoy for high threats
      const pick = Math.random() > 0.5 ? sarcasticManoeuvre : decoy
      recommended = pick
      await think(stepId, "reasoning", `HIGH threat level — recommending ${pick.label.toUpperCase()}. Balances deterrence with escalation management.`)
    } else {
      recommended = manoeuvre
      await think(stepId, "reasoning", `${threatLevel.toUpperCase()} threat level — recommending DEFENSIVE MANOEUVRE. Proportional response minimizes escalation risk.`)
    }
    checkAbort()

    // Mark recommended
    recommended = { ...recommended, recommended: true }

    // Build final responses array with the correct recommended flag
    const allResponses: AgentResponseOption[] = [
      recommended.tier === "manoeuvre" ? recommended : manoeuvre,
      recommended.tier === "sarcastic-manoeuvre" ? recommended : sarcasticManoeuvre,
      recommended.tier === "decoy" ? recommended : decoy,
      destroy, // never auto-recommended
    ]

    await think(stepId, "result", `RECOMMENDED RESPONSE: ${recommended.label} (Tier: ${recommended.tier}, Severity: ${recommended.severity}/4)`)
    checkAbort()
    await think(stepId, "data", `Confidence: ${(recommended.confidence * 100).toFixed(0)}% | Estimated execution: ${recommended.estimatedTimeMin}min | Delta-V: ${recommended.deltaVMs} m/s`)

    useAgentOpsStore.getState().setResponses(allResponses)
    useAgentOpsStore.getState().selectResponse(recommended)
    useAgentOpsStore.getState().completeStep(
      stepId,
      `Recommended: ${recommended.label}. ${recommended.justification}`,
    )
    useAgentOpsStore.getState().completeSession()
  }

  /* ── Main pipeline ──────────────────────────────────── */

  const runSimulation = useCallback(async (params: SimulationParams) => {
    abortedRef.current = false

    try {
      await runStep1(params)
      checkAbort()
      await stepDelay()

      await runStep2(params)
      checkAbort()
      await stepDelay()

      await runStep3(params)
      checkAbort()
      await stepDelay()

      await runStep4(params)
      checkAbort()
      await stepDelay()

      await runStep5(params)
      checkAbort()
      await stepDelay()

      await runStep6(params)
    } catch (e) {
      if ((e as Error).message === "__AGENT_ABORTED__") {
        console.log("[agent-simulation] Pipeline aborted cleanly.")
        return
      }
      console.error("[agent-simulation] Pipeline error:", e)
    }
  }, [])

  const abort = useCallback(() => {
    abortedRef.current = true
  }, [])

  return { runSimulation, abort }
}
