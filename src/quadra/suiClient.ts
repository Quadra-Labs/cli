// suiClient.ts — one place to build the Sui RPC client the CLI uses (balances, pay_for_job,
// Seal session keys). Mirrors agent/app/src/jobs/payJob.ts: SuiJsonRpcClient over the public
// fullnode (or a configured override). NOT the GraphQL client (Walrus SDK gotcha).

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

import type { CliConfig } from "../config/config.js";

/** Build a SuiJsonRpcClient for the configured network/RPC. */
export function buildSuiClient(config: CliConfig): SuiJsonRpcClient {
  const url = config.suiRpcUrl.trim() || getJsonRpcFullnodeUrl(config.network);
  return new SuiJsonRpcClient({ url, network: config.network });
}
