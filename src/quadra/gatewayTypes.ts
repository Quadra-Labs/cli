// gatewayTypes.ts — the data-gateway response shapes the CLI reads. MIRRORED (not imported)
// from data/src/indexer/db.ts and data/src/types.ts so the CLI stays a light, standalone
// package and does not pull quadra-data's heavy deps (fastify, better-sqlite3, a second
// @mysten/sui copy). Keep field names in sync with those source files.

/** One agent row as served by the gateway index (data/src/indexer/db.ts AgentRow). */
export interface AgentRow {
  readonly wallet: string;
  readonly owner: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  /** Raw average score in [0, 100]. */
  readonly score: number;
  /** Number of jobs delivered. */
  readonly jobs: number;
  /** Scoreless agents are paid on delivery and excluded from the leaderboard. */
  readonly scoreless: boolean;
  /** First-indexed timestamp (epoch ms). */
  readonly createdAt: number;
}

/** AgentRow plus the gateway's computed Bayesian `overall` and leaderboard `rank`. */
export interface RankedAgentRow extends AgentRow {
  readonly overall: number;
  readonly rank: number;
}

/** A single agent's detail page (adds the total agent count for "rank of N"). */
export interface AgentDetail extends RankedAgentRow {
  readonly totalAgents: number;
}

/** Server-side query/sort/paginate result for the agent list. */
export interface AgentsPage {
  readonly rows: RankedAgentRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Query params for GET /agents/query. */
export interface AgentsQuery {
  readonly search?: string;
  readonly category?: string;
  readonly minJobs?: number;
  readonly sort?: "overall" | "score" | "jobs" | "name";
  readonly dir?: "asc" | "desc";
  readonly page?: number;
  readonly pageSize?: number;
}

/** One job in an agent's history (data/src/indexer/db.ts JobRow). */
export interface JobRow {
  readonly jobId: string;
  readonly escrowId: string;
  readonly cost: number;
  readonly earned: number;
  readonly paidAtMs: number;
  readonly status: "released" | "refunded" | "pending";
}

/** An agent's self-published live chat endpoint (data/src/types.ts AgentEndpoint). */
export interface AgentEndpoint {
  readonly wallet: string;
  readonly url: string;
  readonly updated_at: number;
}

/** A job template (data/src/types.ts JobTemplate). */
export interface JobTemplate {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly output: Record<string, string>;
  readonly evaluator_id: string;
  readonly start_data_template: Record<string, string>;
  readonly minimum_lifetime: number;
  readonly allowed_assets: string[];
  readonly scoreless?: boolean;
}

/** The sealed result envelope returned by GET /job-results/:jobId (ciphertext only). */
export interface SealedResultBlob {
  readonly sealed: true;
  readonly job_id: string;
  /** Base64 of the Seal encryptedObject bytes. */
  readonly enc: string;
}

/** The decrypted plaintext job result (data/src/types.ts JobResult). */
export interface JobResult {
  readonly job_id: string;
  readonly user: string;
  readonly agent: string;
  readonly status: "pending" | "delivered" | "failed";
  readonly job: { lifetime: string; template: JobTemplate };
  readonly params?: Record<string, string>;
  readonly agent_result: Record<string, unknown>;
  readonly finalized_result: Record<string, unknown>;
  readonly score: number;
  readonly started_at: number;
  readonly delivered_at: number;
}
