"""Base agent wrapping Anthropic Bedrock client with streaming and tool_use loop."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Callable, Awaitable

from anthropic import AnthropicBedrock

logger = logging.getLogger(__name__)

MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0"
MAX_TOKENS = 4096


def _get_client() -> AnthropicBedrock:
    return AnthropicBedrock(
        aws_region=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


ProgressCallback = Callable[[str], Awaitable[None]] | None


class BaseAgent:
    """Base class for all Claude agents in the pipeline.

    The Bedrock SDK is synchronous, so API calls are offloaded to a thread.
    Everything else (tool dispatch, WS callbacks) stays on the main event loop.
    """

    name: str = "base"

    def __init__(self, on_progress: ProgressCallback = None):
        self.client = _get_client()
        self.on_progress = on_progress

    async def _notify(self, text: str) -> None:
        if self.on_progress:
            await self.on_progress(text)

    async def _call_claude(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> Any:
        """Call Claude via Bedrock (sync SDK), run in thread to avoid blocking event loop."""
        kwargs: dict[str, Any] = {
            "model": MODEL_ID,
            "max_tokens": MAX_TOKENS,
            "system": system,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools

        return await asyncio.to_thread(self.client.messages.create, **kwargs)

    async def _run_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        tool_handlers: dict[str, Callable] | None = None,
        max_iterations: int = 10,
    ) -> str:
        """Run Claude in a tool_use loop until it produces a final text response."""
        tool_handlers = tool_handlers or {}
        current_messages = list(messages)
        text_parts: list[str] = []

        for _ in range(max_iterations):
            response = await self._call_claude(system, current_messages, tools)

            # Collect text and tool_use blocks
            text_parts = []
            tool_uses: list[dict] = []

            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_uses.append({
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            # Stream partial text to frontend
            if text_parts:
                await self._notify("".join(text_parts))

            # If no tool calls, we're done
            if not tool_uses:
                return "".join(text_parts)

            # Build assistant message with all content blocks
            assistant_content = []
            for block in response.content:
                if block.type == "text":
                    assistant_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            current_messages.append({"role": "assistant", "content": assistant_content})

            # Execute each tool and build tool_result blocks
            tool_results = []
            for tu in tool_uses:
                handler = tool_handlers.get(tu["name"])
                if handler:
                    try:
                        result = handler(tu["input"])
                        result_str = json.dumps(result) if not isinstance(result, str) else result
                    except Exception as exc:
                        logger.exception("Tool %s failed", tu["name"])
                        result_str = json.dumps({"error": str(exc)})
                else:
                    result_str = json.dumps({"error": f"Unknown tool: {tu['name']}"})

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": result_str,
                })

                await self._notify(f"[Tool: {tu['name']}] called")

            current_messages.append({"role": "user", "content": tool_results})

        return "".join(text_parts) if text_parts else "Agent reached max iterations."

    async def run(self, **kwargs: Any) -> Any:
        """Override in subclasses."""
        raise NotImplementedError
