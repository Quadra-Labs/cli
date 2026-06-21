// config.ts — pure configuration loading for the Quadra Assistant CLI. Reads process.env
// only (no I/O), mirrors the shape of agent/app/src/runtime/config.ts. Every value is
// optional and falls back to the documented live defaults in ids.ts. NEVER holds a private
// key: wallets live in the encrypted keystore, never in env.

import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  DEFAULT_AGENT_REGISTRY_ID,
  DEFAULT_GATEWAY_TIMEOUT_MS,
  DEFAULT_GATEWAY_URL,
  DEFAULT_INTAKE_URL,
  DEFAULT_JOB_ACCESS_REGISTRY_ID,
  DEFAULT_NETWORK,
  DEFAULT_QUADRA_PACKAGE_ID,
  DEFAULT_SEAL_KEY_SERVER_IDS,
  DEFAULT_SEAL_THRESHOLD,
} from "./ids.js";

export type SuiNetwork = "testnet" | "mainnet" | "devnet" | "localnet";

export interface CliConfig {
  /** Deployed `quadra` package id (QUADRA coin type + Seal namespace). */
  readonly quadraPackageId: string;
  /** Shared `agent::AgentRegistry` object id. */
  readonly agentRegistryId: string;
  /** Shared `job_access::JobAccessRegistry` object id. */
  readonly jobAccessRegistryId: string;
  /** Data gateway base URL (discovery, templates, sealed results). */
  readonly gatewayUrl: string;
  /** Intake engine base URL (reserved; agents open jobs, not the CLI). */
  readonly intakeUrl: string;
  /** Sui network the package lives on. */
  readonly network: SuiNetwork;
  /** Sui RPC URL. Empty -> derive the public fullnode for the network. */
  readonly suiRpcUrl: string;
  /** Open-mode Seal key server object ids. */
  readonly sealKeyServerIds: readonly string[];
  /** Seal TSS threshold (how many key servers must return a share). */
  readonly sealThreshold: number;
  /** Directory the encrypted keystore lives in (default ~/.quadra). */
  readonly keystoreDir: string;
  /** Timeout for gateway reads (gateway can be ~30s warm). */
  readonly gatewayTimeoutMs: number;
  /** OpenAI API key powering the Quadra Assistant concierge. Absent -> the assistant is
   *  unavailable and the CLI falls back to manual browse. NEVER logged. */
  readonly openaiApiKey: string | undefined;
  /** OpenAI model the concierge uses (env OPENAI_MODEL). */
  readonly openaiModel: string;
  /** OpenAI-compatible base URL (env OPENAI_BASE_URL); allows proxies/compatible providers. */
  readonly openaiBaseUrl: string;
}

function readTrimmed(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readCsv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: readonly string[],
): readonly string[] {
  const raw = readTrimmed(env, key);
  if (raw === undefined) return fallback;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : fallback;
}

function readPositiveInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = readTrimmed(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNetwork(env: NodeJS.ProcessEnv): SuiNetwork {
  const raw = (readTrimmed(env, "WALRUS_NETWORK") ?? DEFAULT_NETWORK).toLowerCase();
  if (raw === "testnet" || raw === "mainnet" || raw === "devnet" || raw === "localnet") {
    return raw;
  }
  return "testnet";
}

/** Build the typed CLI config from the environment. Pure aside from reading env. */
export function loadCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  const keystoreDir = readTrimmed(env, "QUADRA_HOME") ?? resolve(homedir(), ".quadra");
  return {
    quadraPackageId: readTrimmed(env, "QUADRA_PACKAGE_ID") ?? DEFAULT_QUADRA_PACKAGE_ID,
    agentRegistryId: readTrimmed(env, "AGENT_REGISTRY_ID") ?? DEFAULT_AGENT_REGISTRY_ID,
    jobAccessRegistryId:
      readTrimmed(env, "JOB_ACCESS_REGISTRY_ID") ?? DEFAULT_JOB_ACCESS_REGISTRY_ID,
    gatewayUrl:
      readTrimmed(env, "DATA_GATEWAY_URL") ??
      readTrimmed(env, "GATEWAY_URL") ??
      DEFAULT_GATEWAY_URL,
    intakeUrl: readTrimmed(env, "INTAKE_URL") ?? DEFAULT_INTAKE_URL,
    network: readNetwork(env),
    suiRpcUrl: readTrimmed(env, "SUI_RPC_URL") ?? "",
    sealKeyServerIds: readCsv(env, "SEAL_KEY_SERVER_IDS", DEFAULT_SEAL_KEY_SERVER_IDS),
    sealThreshold: readPositiveInt(env, "SEAL_THRESHOLD", DEFAULT_SEAL_THRESHOLD),
    keystoreDir,
    gatewayTimeoutMs: readPositiveInt(env, "GATEWAY_TIMEOUT_MS", DEFAULT_GATEWAY_TIMEOUT_MS),
    openaiApiKey: readTrimmed(env, "OPENAI_API_KEY"),
    openaiModel: readTrimmed(env, "OPENAI_MODEL") ?? "gpt-4o-mini",
    openaiBaseUrl: readTrimmed(env, "OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
  };
}
