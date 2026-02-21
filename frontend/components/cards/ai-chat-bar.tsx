"use client"

import { useCallback, useRef, useState } from "react"
import { HelpCircle, Maximize2, Send, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { AITerminal, type AITerminalHandle } from "@/components/terminal/ai-terminal"

export function AiChatBar({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState("")
  const terminalRef = useRef<AITerminalHandle>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput("")
    setExpanded(true)
    // Give the terminal a tick to mount, then trigger it
    setTimeout(() => {
      terminalRef.current?.triggerWithPrompt(trimmed)
    }, 100)
  }, [input])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <>
      {/* Chat input pill */}
      <div
        className={cn(
          "pointer-events-auto w-[450px] rounded-full border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl",
          className
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what you want to know..."
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
          />
          <div className="flex items-center gap-1">
            {input.trim() && (
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-full p-1.5 text-cyan-400 transition-colors hover:bg-white/10"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded terminal modal overlay */}
      {expanded && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-card/90 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
            <AITerminal
              ref={terminalRef}
              isOpen={true}
              onToggle={() => setExpanded(false)}
              className="rounded-2xl"
            />
          </div>
        </div>
      )}
    </>
  )
}
