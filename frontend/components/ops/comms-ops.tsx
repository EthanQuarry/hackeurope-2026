"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Send,
  Loader2,
  User,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Satellite,
  X,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useCommsStore } from "@/stores/comms-store"
import { useCommsStream } from "@/hooks/use-comms-stream"
import { CommsTranscriptionView } from "@/components/ops/comms-transcription-view"
import { api } from "@/lib/api"
import type { CommsChatMessage, CommsChatResponse, ParsedIntent } from "@/types"

/* ═══════════════════════════════════════════════════════
   Chat phases
   ═══════════════════════════════════════════════════════ */

type Phase =
  | "chat"           // conversing with AI
  | "approve"        // AI proposed a command, waiting for user approval
  | "confirm"        // user approved, showing "are you sure?" dialog
  | "translating"    // sending to Iridium protocol translation pipeline

/* ═══════════════════════════════════════════════════════
   Main CommsOps Component
   ═══════════════════════════════════════════════════════ */

export function CommsOps() {
  const { sendCommand } = useCommsStream()
  const isStreaming = useCommsStore((s) => s.isStreaming)
  const history = useCommsStore((s) => s.history)

  // Chat state
  const [messages, setMessages] = useState<CommsChatMessage[]>([])
  const [input, setInput] = useState("")
  const [phase, setPhase] = useState<Phase>("chat")
  const [isLoading, setIsLoading] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null)
  const [pendingCommandText, setPendingCommandText] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, phase])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // When translation completes, reset to chat phase
  useEffect(() => {
    if (!isStreaming && phase === "translating") {
      // Keep messages but allow new conversation
      setPhase("chat")
    }
  }, [isStreaming, phase])

  // ── Send chat message ──
  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || isLoading || phase !== "chat") return

    const newMessages: CommsChatMessage[] = [...messages, { role: "user", content: msg }]
    setMessages(newMessages)
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch(api.commsChat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: CommsChatResponse = await res.json()

      // Add assistant reply
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }])

      // If the AI proposed a command, move to approve phase
      if (data.command_ready && data.parsed_intent) {
        setPendingIntent(data.parsed_intent)
        setPendingCommandText(data.parsed_intent.summary)
        setPhase("approve")
      }
    } catch (err) {
      // Fallback: mock response when backend is down
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I understand you want to send a satellite command. Could you tell me which satellite you'd like to target and what action to take? For example: \"Move USA-245 away from SJ-26\" or \"Request telemetry from the ISS\".",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, phase])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // ── Approval flow ──
  const handleApprove = useCallback(() => {
    setPhase("confirm")
  }, [])

  const handleReject = useCallback(() => {
    setPendingIntent(null)
    setPendingCommandText(null)
    setPhase("chat")
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "I'd like to modify this command." },
    ])
    // The AI will see the rejection and adjust
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "No problem. What would you like to change about the command?" },
      ])
    }, 300)
  }, [])

  const handleConfirmTransmit = useCallback(() => {
    if (!pendingCommandText || !pendingIntent) return
    setPhase("translating")
    // Send to the existing protocol translation pipeline
    sendCommand(pendingCommandText, pendingIntent.target_satellite_id)
  }, [pendingCommandText, pendingIntent, sendCommand])

  const handleCancelConfirm = useCallback(() => {
    setPhase("approve")
  }, [])

  // ── New conversation ──
  const handleNewConversation = useCallback(() => {
    setMessages([])
    setPendingIntent(null)
    setPendingCommandText(null)
    setPhase("chat")
    setInput("")
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  return (
    <div className="grid h-full w-full grid-cols-2 gap-4">
      {/* ─── Left panel: Chat + Approval ─── */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-2 w-2 rounded-full",
                phase === "translating" ? "bg-cyan-400 animate-pulse" : "bg-emerald-400",
              )} />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
                Iridium Comms
              </h2>
            </div>
            {messages.length > 0 && phase === "chat" && (
              <button
                type="button"
                onClick={handleNewConversation}
                className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                New
              </button>
            )}
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {phase === "chat" && "Describe your command in plain English"}
            {phase === "approve" && "Review the proposed command"}
            {phase === "confirm" && "Confirm transmission"}
            {phase === "translating" && "Translating to Iridium SBD protocol..."}
          </p>
        </div>

        {/* Chat messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-1 p-3">
            {/* Welcome message if empty */}
            {messages.length === 0 && (
              <div className="flex gap-2 px-2 py-6">
                <Satellite className="h-4 w-4 shrink-0 text-primary/60 mt-0.5" />
                <div className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                  Describe what you need in plain English. I&apos;ll ask any questions needed, then build the command for your approval before transmitting.
                  <br /><br />
                  <span className="text-muted-foreground/50">
                    Try: &ldquo;Move USA-245 away from SJ-26&rdquo; or &ldquo;Get me a status report on the ISS&rdquo;
                  </span>
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2 px-2 py-1.5", msg.role === "user" && "justify-end")}>
                {msg.role === "assistant" && (
                  <Bot className="h-3.5 w-3.5 shrink-0 text-primary/60 mt-1" />
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary/15 text-foreground"
                      : "bg-secondary/30 text-foreground",
                  )}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 mt-1" />
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2 px-2 py-1.5">
                <Bot className="h-3.5 w-3.5 shrink-0 text-primary/60 mt-1" />
                <div className="rounded-lg bg-secondary/30 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            {/* ── Approval Card ── */}
            {phase === "approve" && pendingIntent && (
              <div className="mx-2 mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-primary">
                    Proposed Command
                  </span>
                </div>

                <div className="space-y-1.5 mb-3">
                  <CmdRow label="Target" value={pendingIntent.target_satellite_name} />
                  <CmdRow label="Type" value={pendingIntent.command_type.replace(/_/g, " ").toUpperCase()} />
                  <CmdRow label="Urgency" value={pendingIntent.urgency.toUpperCase()} alert={pendingIntent.urgency !== "normal"} />
                  <CmdRow label="Summary" value={pendingIntent.summary} />
                  {Object.keys(pendingIntent.parameters).length > 0 && (
                    <div className="rounded border border-border/20 bg-secondary/20 px-2 py-1.5 mt-1">
                      <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-0.5">Parameters</div>
                      {Object.entries(pendingIntent.parameters).map(([k, v]) => (
                        <CmdRow key={k} label={k.replace(/_/g, " ")} value={String(v)} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleApprove}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-500/25"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Approve Command
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-border/40 bg-secondary/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary/40"
                  >
                    <X className="h-3 w-3" />
                    Modify
                  </button>
                </div>
              </div>
            )}

            {/* ── Confirmation Dialog ── */}
            {phase === "confirm" && pendingIntent && (
              <div className="mx-2 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-400">
                    Confirm Transmission
                  </span>
                </div>

                <p className="font-mono text-[10px] text-foreground/80 leading-relaxed mb-1">
                  This command will be translated to Iridium SBD protocol and transmitted to:
                </p>
                <p className="font-mono text-[11px] font-semibold text-foreground mb-3">
                  {pendingIntent.target_satellite_name}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmTransmit}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/20 px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400 transition-colors hover:bg-amber-500/30"
                  >
                    <Send className="h-3 w-3" />
                    Confirm &amp; Transmit
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelConfirm}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-border/40 bg-secondary/20 px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary/40"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* ── Translating indicator ── */}
            {phase === "translating" && (
              <div className="mx-2 mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  <span className="font-mono text-[10px] text-cyan-400">
                    Translating to Iridium SBD protocol...
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input bar — only active during chat phase */}
        <div className="border-t border-border/40 px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={phase === "chat" ? "Type your command..." : "Waiting for approval..."}
              disabled={phase !== "chat" || isLoading}
              className={cn(
                "flex-1 rounded-md border border-border/60 bg-secondary/30 px-3 py-2",
                "font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40",
                "focus:outline-none focus:ring-1 focus:ring-primary/50",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || phase !== "chat" || isLoading}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                input.trim() && phase === "chat" && !isLoading
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "text-muted-foreground/20 cursor-not-allowed",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* History count */}
          {history.length > 0 && (
            <div className="mt-2 font-mono text-[8px] text-muted-foreground/40 text-center">
              {history.length} command{history.length !== 1 ? "s" : ""} transmitted this session
            </div>
          )}
        </div>
      </div>

      {/* ─── Right panel: Transcription stages ─── */}
      <CommsTranscriptionView />
    </div>
  )
}

/* ─── Helper: command detail row ─── */
function CmdRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span className={cn(
        "font-mono text-[10px] text-right",
        alert ? "text-amber-400 font-semibold" : "text-foreground",
      )}>
        {value}
      </span>
    </div>
  )
}
