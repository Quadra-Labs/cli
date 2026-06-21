// agentCatalog.ts — gather the capability + score catalog the concierge routes over. This is the
// same information MemWal agent menus are built from, but read from the live gateway: agents (name,
// category, on-chain score, description) plus the job templates that describe what each category
// can actually do. The catalog is handed to the LLM for capability matching; scores are kept so the
// app can rank the LLM's matches and pick the highest-scored (the user's stated priority).

import { getTemplates, queryAgents } from "../quadra/gatewayClient.js";
import type { CliConfig } from "../config/config.js";
import type { JobTemplate, RankedAgentRow } from "../quadra/gatewayTypes.js";

const MAX_AGENTS = 40;

export interface Catalog {
  /** Agents ranked by on-chain overall score (best first). */
  readonly agents: RankedAgentRow[];
  /** Fast lookup from wallet -> agent row (for resolving the LLM's picks). */
  readonly byWallet: Map<string, RankedAgentRow>;
  /** Job templates grouped by category, for describing capabilities to the LLM. */
  readonly templatesByCategory: Map<string, JobTemplate[]>;
}

export type CatalogResult =
  | { ok: true; catalog: Catalog }
  | { ok: false; reason: string };

/** Build the routing catalog from the gateway. NEVER throws. */
export async function buildCatalog(config: CliConfig): Promise<CatalogResult> {
  const [agentsRes, templatesRes] = await Promise.all([
    queryAgents(config, { sort: "overall", dir: "desc", pageSize: MAX_AGENTS }),
    getTemplates(config),
  ]);
  if (!agentsRes.ok) return { ok: false, reason: agentsRes.message };

  const agents = agentsRes.data.rows;
  const byWallet = new Map(agents.map((a) => [a.wallet, a]));

  const templatesByCategory = new Map<string, JobTemplate[]>();
  if (templatesRes.ok) {
    for (const t of templatesRes.data) {
      const list = templatesByCategory.get(t.category) ?? [];
      list.push(t);
      templatesByCategory.set(t.category, list);
    }
  }

  return { ok: true, catalog: { agents, byWallet, templatesByCategory } };
}

/** Render the catalog as compact text for the LLM system prompt. */
export function catalogToPrompt(catalog: Catalog): string {
  const agentLines = catalog.agents.map((a) => {
    const score = a.scoreless
      ? "scoreless (paid on delivery, unranked)"
      : `${a.overall.toFixed(1)}/100 over ${a.jobs} job(s)`;
    return [
      `- wallet: ${a.wallet}`,
      `  name: ${a.name}`,
      `  category: ${a.category}`,
      `  score: ${score}`,
      `  about: ${a.description || "(no description)"}`,
    ].join("\n");
  });

  const capabilityLines: string[] = [];
  for (const [category, templates] of catalog.templatesByCategory) {
    const examples = templates
      .slice(0, 6)
      .map((t) => {
        const assets = t.allowed_assets.length > 0 ? ` [${t.allowed_assets.join(", ")}]` : "";
        return `    • ${t.description}${assets}`;
      })
      .join("\n");
    capabilityLines.push(`  ${category}:\n${examples}`);
  }

  return [
    "AGENTS:",
    agentLines.join("\n") || "  (none online)",
    "",
    "WHAT EACH CATEGORY CAN DO:",
    capabilityLines.join("\n") || "  (no templates published)",
  ].join("\n");
}
