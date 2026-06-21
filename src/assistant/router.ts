// router.ts — the concierge routing brain (UI-agnostic, portable). Given the conversation and the
// live catalog, the LLM decides which agents fit the user's need (capability match). The app then
// ranks those matches by on-chain score and picks the highest — exactly the stated priority:
// "handy for the user first, then the highest score". If the LLM lacks information it asks one
// question instead of guessing. NEVER throws.

import { catalogToPrompt, type Catalog } from "./agentCatalog.js";
import { openaiChat, type OpenAiMessage } from "./openaiClient.js";
import type { CliConfig } from "../config/config.js";
import type { RankedAgentRow } from "../quadra/gatewayTypes.js";

/** A prior turn fed back to the LLM (only the visible text, not the raw JSON). */
export interface RouterHistoryTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export type RouteResult =
  | {
      ok: true;
      /** The assistant's conversational reply to show the user. */
      reply: string;
      /** Highest-scored capability match, or undefined if none / needs more info. */
      recommended?: RankedAgentRow;
      /** Other capability matches, ranked by score (excludes the recommended one). */
      alternates: RankedAgentRow[];
      /** True when the assistant needs more detail before recommending. */
      needMoreInfo: boolean;
    }
  | { ok: false; reason: string };

interface RouterJson {
  message?: unknown;
  candidates?: unknown;
  need_more_info?: unknown;
  question?: unknown;
}

const SYSTEM_PREAMBLE = [
  'You are "Quadra Assistant", a CONCIERGE for the Quadra marketplace.',
  "You do NOT do any work yourself. Independent AI agents do the jobs (price forecasts,",
  "prediction-market prices, etc.), each with an on-chain score from past performance. Your ONLY",
  "job is to recommend WHICH agent the user should hire.",
  "",
  "You are given the live catalog of agents and what each category can do.",
  "",
  "How to respond:",
  "- The moment the user's request maps to an agent's capability, RECOMMEND agents: put their exact",
  '  wallet strings in "candidates", best-fit first. Include EVERY agent that fits; the app ranks',
  "  them by score and picks the best. Do not pre-filter by score yourself.",
  "- Recommend even when job details (time window, exact band, market, etc.) are unspecified. You do",
  "  NOT collect those — the chosen agent scopes them with the user AFTER connecting. NEVER ask the",
  "  user for job parameters.",
  "- Only set need_more_info=true if the request is too vague to pick ANY category/agent at all; then",
  "  ask ONE short question and leave candidates empty. A normal request like \"eth price guesses\" is",
  "  NOT too vague — recommend the matching agent(s).",
  '- "message": one or two short sentences naming the recommended agent and why it fits. Speak about',
  '  agents in the THIRD PERSON. You are a router, not the worker: NEVER say "I can do / I can',
  "  arrange / I'll place a job\". Describe what the AGENT does.",
  "- Only reference agents from the catalog, using their exact wallet string. Never invent agents.",
  "",
  "Style examples:",
  '  GOOD: "For an ETH price band, EthPriceBandAgent is the best fit. Type connect to scope it."',
  '  BAD:  "I can arrange ETH price forecasts." / "I will place a job for you."',
  "",
  "Respond with ONLY a JSON object of this exact shape:",
  '{"message": string, "candidates": string[], "need_more_info": boolean, "question": string}',
].join("\n");

function parseJson(raw: string): RouterJson | undefined {
  try {
    return JSON.parse(raw) as RouterJson;
  } catch {
    // json_object mode should make this unnecessary, but tolerate a wrapped object.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as RouterJson;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

// Recover a recommendation from agent names mentioned in the reply, ranked by score. Used only when
// the model returned no usable candidates yet did not ask a clarifying question.
function recoverFromMention(message: string, agents: readonly RankedAgentRow[]): RankedAgentRow[] {
  const lower = message.toLowerCase();
  return agents
    .filter((a) => a.name.length > 0 && lower.includes(a.name.toLowerCase()))
    .slice()
    .sort((a, b) => b.overall - a.overall);
}

/** Run one concierge turn: converse + (when confident) recommend the best-fit, highest-scored agent. */
export async function routeTurn(input: {
  config: CliConfig;
  catalog: Catalog;
  history: RouterHistoryTurn[];
  userMessage: string;
}): Promise<RouteResult> {
  const messages: OpenAiMessage[] = [
    { role: "system", content: `${SYSTEM_PREAMBLE}\n\n${catalogToPrompt(input.catalog)}` },
    ...input.history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: input.userMessage },
  ];

  const res = await openaiChat(input.config, messages, { json: true });
  if (!res.ok) return { ok: false, reason: res.reason };

  const parsed = parseJson(res.content);
  if (!parsed) return { ok: false, reason: "could not parse the assistant's response" };

  const needMoreInfo = parsed.need_more_info === true;
  const message =
    typeof parsed.message === "string" && parsed.message.trim().length > 0
      ? parsed.message.trim()
      : typeof parsed.question === "string"
        ? parsed.question.trim()
        : "Could you tell me a bit more about what you need?";

  // Resolve the LLM's wallet picks to known agents, then rank by on-chain score (highest first).
  const wallets = Array.isArray(parsed.candidates)
    ? parsed.candidates.filter((w): w is string => typeof w === "string")
    : [];
  let ranked = wallets
    .map((w) => input.catalog.byWallet.get(w))
    .filter((a): a is RankedAgentRow => a !== undefined)
    .sort((a, b) => b.overall - a.overall);

  // Safety net for chatty/weaker models: if it gave no usable candidates but did not ask a
  // question, recover a recommendation from any catalog agent it named in its reply.
  if (!needMoreInfo && ranked.length === 0) {
    ranked = recoverFromMention(message, input.catalog.agents);
  }

  const [recommended, ...alternates] = ranked;
  return {
    ok: true,
    reply: message,
    ...(needMoreInfo ? {} : recommended ? { recommended } : {}),
    alternates: needMoreInfo ? [] : alternates,
    needMoreInfo,
  };
}
