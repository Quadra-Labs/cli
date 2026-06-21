// agentChatClient.ts — talk to a live agent's own HTTP server (agent/app/src/runtime/
// runHttpAgent.ts). GET /ping reports liveness + readiness; POST /chat drives one turn and may
// return a `job` payload (a proposed job to pay for). Both are UNSIGNED — the agent's chat
// surface is open (CORS *). NEVER throws.

export interface AgentPing {
  readonly ok: boolean;
  readonly name?: string;
  readonly address?: string | null;
  readonly ready?: boolean;
}

/** A job the agent proposes mid-chat; the user pays this on-chain to proceed. */
export interface ProposedJob {
  readonly session_id: string;
  readonly job_id: string;
  readonly agent_wallet: string;
  /** Cost in QUADRA base units. */
  readonly cost: number;
}

export interface ChatReply {
  readonly reply: string;
  readonly notes: string[];
  readonly job?: ProposedJob;
}

export type PingResult =
  | { ok: true; ping: AgentPing }
  | { ok: false; reason: string };

export type ChatResult =
  | { ok: true; reply: ChatReply }
  | { ok: false; reason: string };

function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/** GET {base}/ping — check the agent is online and ready. */
export async function pingAgent(base: string, timeoutMs = 10_000): Promise<PingResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${trimBase(base)}/ping`, { method: "GET", signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `agent returned HTTP ${res.status}` };
    const ping = (await res.json()) as AgentPing;
    return { ok: true, ping };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "agent unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** POST {base}/chat — send one user message, get the agent's reply (+ optional job). */
export async function chatWithAgent(
  base: string,
  input: { message: string; conversationId: string; user: string },
  timeoutMs = 60_000,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${trimBase(base)}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      reply?: string;
      notes?: string[];
      job?: ProposedJob;
      error?: string;
    };
    if (!res.ok || body.ok !== true) {
      return { ok: false, reason: body.error ?? `agent returned HTTP ${res.status}` };
    }
    return {
      ok: true,
      reply: {
        reply: typeof body.reply === "string" ? body.reply : "",
        notes: Array.isArray(body.notes) ? body.notes : [],
        ...(body.job ? { job: body.job } : {}),
      },
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "chat request failed" };
  } finally {
    clearTimeout(timer);
  }
}
