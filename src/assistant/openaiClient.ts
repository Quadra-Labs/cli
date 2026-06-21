// openaiClient.ts — minimal OpenAI chat client over raw fetch (mirrors the repo's framework
// models.ts approach: raw fetch, lazy key, no SDK). Powers the Quadra Assistant concierge. The
// key is read from config and NEVER logged. Supports JSON-mode for structured routing output.

import type { CliConfig } from "../config/config.js";

export interface OpenAiMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export type OpenAiResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

export interface OpenAiCallOptions {
  /** Force a JSON object response (response_format json_object). */
  readonly json?: boolean;
  readonly temperature?: number;
  readonly timeoutMs?: number;
}

/** True when an API key is configured (the assistant can run). */
export function assistantAvailable(config: CliConfig): boolean {
  return (config.openaiApiKey ?? "").length > 0;
}

/** One chat completion. NEVER throws; NEVER logs the key. */
export async function openaiChat(
  config: CliConfig,
  messages: OpenAiMessage[],
  options: OpenAiCallOptions = {},
): Promise<OpenAiResult> {
  const key = config.openaiApiKey ?? "";
  if (key.length === 0) return { ok: false, reason: "OPENAI_API_KEY is not set" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  try {
    const res = await fetch(`${config.openaiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages,
        temperature: 1,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => undefined)) as
      | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
      | undefined;
    if (!res.ok) {
      const msg = body?.error?.message ?? `OpenAI returned HTTP ${res.status}`;
      return { ok: false, reason: msg };
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return { ok: false, reason: "OpenAI returned an empty response" };
    }
    return { ok: true, content };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "OpenAI request failed" };
  } finally {
    clearTimeout(timer);
  }
}
