// gatewayClient.ts — read-only client for the Quadra data gateway. Every endpoint the CLI
// uses for discovery and result retrieval is an OPEN GET (no signature), so this is a thin
// timeout-bounded fetch wrapper. The gateway can take ~30s on a cold cache, hence the generous
// default timeout. NEVER throws — transport and HTTP errors come back as typed results.

import type { CliConfig } from "../config/config.js";
import type {
  AgentDetail,
  AgentEndpoint,
  AgentsPage,
  AgentsQuery,
  JobRow,
  JobTemplate,
  SealedResultBlob,
} from "./gatewayTypes.js";

export type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "http_error" | "network_error"; status?: number; message: string };

async function getJson<T>(
  config: CliConfig,
  path: string,
  timeoutMs = config.gatewayTimeoutMs,
): Promise<GatewayResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.gatewayUrl}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await res.text();
    const body: unknown = text.length > 0 ? safeParse(text) : undefined;
    if (!res.ok) {
      return { ok: false, kind: "http_error", status: res.status, message: messageOf(body, res.statusText) };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      kind: "network_error",
      message: err instanceof Error ? err.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as { error?: unknown; message?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return typeof body === "string" && body.length > 0 ? body : fallback;
}

function buildQuery(q: AgentsQuery): string {
  const params = new URLSearchParams();
  if (q.search) params.set("search", q.search);
  if (q.category) params.set("category", q.category);
  if (q.minJobs !== undefined) params.set("minJobs", String(q.minJobs));
  if (q.sort) params.set("sort", q.sort);
  if (q.dir) params.set("dir", q.dir);
  if (q.page !== undefined) params.set("page", String(q.page));
  if (q.pageSize !== undefined) params.set("pageSize", String(q.pageSize));
  const s = params.toString();
  return s.length > 0 ? `?${s}` : "";
}

/** GET /agents/query — ranked, filtered, paginated agents. */
export function queryAgents(config: CliConfig, q: AgentsQuery): Promise<GatewayResult<AgentsPage>> {
  return getJson<AgentsPage>(config, `/agents/query${buildQuery(q)}`);
}

/** GET /agents/:wallet — one agent's detail (or null if unknown). */
export function getAgentDetail(
  config: CliConfig,
  wallet: string,
): Promise<GatewayResult<AgentDetail | null>> {
  return getJson<AgentDetail | null>(config, `/agents/${wallet}`);
}

/** GET /agents/:wallet/jobs — an agent's recent jobs. */
export function getAgentJobs(
  config: CliConfig,
  wallet: string,
): Promise<GatewayResult<{ jobs: JobRow[]; total: number }>> {
  return getJson<{ jobs: JobRow[]; total: number }>(config, `/agents/${wallet}/jobs`);
}

/** GET /agent-endpoints/:wallet — the agent's live chat URL (or null). */
export function getAgentEndpoint(
  config: CliConfig,
  wallet: string,
): Promise<GatewayResult<AgentEndpoint | null>> {
  return getJson<AgentEndpoint | null>(config, `/agent-endpoints/${wallet}`);
}

/** GET /templates — all job templates. */
export function getTemplates(config: CliConfig): Promise<GatewayResult<JobTemplate[]>> {
  return getJson<JobTemplate[]>(config, `/templates`);
}

export type JobResultBlobResult =
  | { ok: true; blob: SealedResultBlob }
  // The result is not registered yet (the gateway throws "No result indexed"); keep polling.
  | { ok: false; kind: "not_ready" }
  | { ok: false; kind: "error"; message: string };

/**
 * GET /job-results/:jobId — fetch the sealed envelope. The gateway throws (500) with
 * "No result indexed for job ..." until the agent has registered the result; that maps to
 * `not_ready` so the caller can keep polling. A short timeout keeps polling responsive.
 */
export async function fetchJobResultBlob(
  config: CliConfig,
  jobId: string,
): Promise<JobResultBlobResult> {
  const res = await getJson<SealedResultBlob>(config, `/job-results/${jobId}`, 15_000);
  if (res.ok) {
    if (res.data && typeof res.data === "object" && res.data.sealed === true) {
      return { ok: true, blob: res.data };
    }
    return { ok: false, kind: "error", message: "unexpected result envelope" };
  }
  if (/no result indexed/i.test(res.message)) return { ok: false, kind: "not_ready" };
  return { ok: false, kind: "error", message: res.message };
}
