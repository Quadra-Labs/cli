// ids.ts — the live (published) on-chain object ids and service URLs the CLI talks to by
// default. Every one is overridable via env (see config.ts); these constants are the
// documented production values so the CLI works out-of-the-box with zero config. None of
// these are secrets — they are public on-chain ids and public endpoints.

/** Deployed `quadra` Move package id (also the QUADRA coin type + Seal package namespace). */
export const DEFAULT_QUADRA_PACKAGE_ID =
  "0x6350b090b44ca4d1c4884e3de24868a462bc3201911d7ca9457e68251bd4ac46";

/** Shared `agent::AgentRegistry` object id (needed to build pay_for_job). */
export const DEFAULT_AGENT_REGISTRY_ID =
  "0x572320726d1cde2c829b243e1f30e9d9996ae4e9f1ca62a28d9288075b6b4a99";

/** Shared `job_access::JobAccessRegistry` object id (pay_for_job + seal_approve). */
export const DEFAULT_JOB_ACCESS_REGISTRY_ID =
  "0x352c6aa35f0ea957b89b6476c14eecca52ed6ac5e633b0c9ee2d4356703cd21e";

/** Live data gateway base URL (agent discovery, templates, sealed results). */
export const DEFAULT_GATEWAY_URL = "https://api.quadra.sh";

/** Live intake engine base URL (jobs are opened by agents; reserved for future CLI use). */
export const DEFAULT_INTAKE_URL = "https://intake.quadra.sh";

/** Sui network the package is deployed on. */
export const DEFAULT_NETWORK = "testnet";

// Open-mode testnet Seal key servers (copied from agent/app/src/runtime/config.ts:36-39).
// Both run in Open mode, so basic testnet decryption needs no API key. With a threshold of
// 1, decryption works as long as either server is reachable.
export const DEFAULT_SEAL_KEY_SERVER_IDS: readonly string[] = [
  "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
];

export const DEFAULT_SEAL_THRESHOLD = 1;

/** Gateway reads can take up to ~30s on a cold cache (Walrus pointer resolves). */
export const DEFAULT_GATEWAY_TIMEOUT_MS = 30_000;
