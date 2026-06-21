// payJob.ts — COPIED from agent/app/src/jobs/payJob.ts — keep in sync; the CLI is a standalone
// package. In the agent app the agent HOST runs this in a single-wallet demo; here it is run by
// the paying USER's wallet (exactly the "real multi-user product" the original comment
// describes). It locks `cost` QUADRA from the payer into the job's on-chain Escrow (emitting
// JobPaid, which the intake engine watches to release the agent to start the work). NEVER throws.

import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import type { Signer } from "@mysten/sui/cryptography";

export interface PayForJobInput {
  /** The payer (the user's unlocked wallet). */
  readonly signer: Signer;
  readonly network: "testnet" | "mainnet" | "devnet" | "localnet";
  /** Deployed `quadra` package id; also the QUADRA coin type namespace. */
  readonly quadraPackageId: string;
  /** Shared `agent::AgentRegistry` object id. */
  readonly agentRegistryId: string;
  /** Shared `job_access::JobAccessRegistry` object id. */
  readonly jobAccessRegistryId: string;
  /** The intake session minted at submit. */
  readonly sessionId: string;
  readonly jobId: string;
  /** The agent's wallet the escrow is keyed to (session.agent_wallet). */
  readonly agentWallet: string;
  /** Cost in QUADRA base units (session.cost). */
  readonly cost: number;
  /** Optional Sui RPC URL override; defaults to the network fullnode. */
  readonly suiRpcUrl?: string;
}

export type PayForJobResult =
  | { ok: true; digest: string }
  | { ok: false; kind: "config_error"; message: string }
  | { ok: false; kind: "tx_error"; message: string };

/**
 * Lock `cost` QUADRA from `signer` into the job's escrow via `quadra::intake::pay_for_job`.
 * Returns the tx digest on success, or a typed failure. NEVER throws; never logs the signer.
 */
export async function payForJob(input: PayForJobInput): Promise<PayForJobResult> {
  const pkg = input.quadraPackageId.trim();
  const agentRegistry = input.agentRegistryId.trim();
  const accessRegistry = input.jobAccessRegistryId.trim();
  if (pkg.length === 0) return { ok: false, kind: "config_error", message: "QUADRA_PACKAGE_ID is not set" };
  if (agentRegistry.length === 0)
    return { ok: false, kind: "config_error", message: "AGENT_REGISTRY_ID is not set" };
  if (accessRegistry.length === 0)
    return { ok: false, kind: "config_error", message: "JOB_ACCESS_REGISTRY_ID is not set" };
  if (!(input.cost > 0)) return { ok: false, kind: "config_error", message: "cost must be positive" };

  const url = (input.suiRpcUrl ?? "").trim() || getJsonRpcFullnodeUrl(input.network);
  const client = new SuiJsonRpcClient({ url, network: input.network });
  const quadraType = `${pkg}::quadra::QUADRA`;
  const costN = BigInt(Math.round(input.cost));
  const payerAddr = input.signer.toSuiAddress();

  try {
    const coins = await client.getCoins({ owner: payerAddr, coinType: quadraType });
    if (coins.data.length === 0) {
      return { ok: false, kind: "tx_error", message: `payer holds no ${quadraType} coins` };
    }
    const sorted = [...coins.data].sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
    const total = sorted.reduce((s, c) => s + BigInt(c.balance), 0n);
    if (total < costN) {
      return { ok: false, kind: "tx_error", message: `insufficient QUADRA: have ${total}, need ${costN}` };
    }

    const tx = new Transaction();
    const primary = tx.object(sorted[0]!.coinObjectId);
    if (BigInt(sorted[0]!.balance) < costN && sorted.length > 1) {
      tx.mergeCoins(
        primary,
        sorted.slice(1).map((c) => tx.object(c.coinObjectId)),
      );
    }
    const [payment] = tx.splitCoins(primary, [tx.pure.u64(costN)]);
    tx.moveCall({
      target: `${pkg}::intake::pay_for_job`,
      arguments: [
        tx.object(agentRegistry),
        tx.object(accessRegistry),
        tx.pure.string(input.sessionId),
        tx.pure.string(input.jobId),
        tx.pure.address(input.agentWallet),
        payment!,
        tx.object("0x6"), // the shared Clock
      ],
    });

    const res = await client.signAndExecuteTransaction({
      signer: input.signer,
      transaction: tx,
      options: { showEffects: true },
    });
    if (res.effects?.status.status !== "success") {
      return { ok: false, kind: "tx_error", message: res.effects?.status.error ?? "pay_for_job failed" };
    }
    return { ok: true, digest: res.digest };
  } catch (err) {
    return { ok: false, kind: "tx_error", message: err instanceof Error ? err.message : "pay_for_job failed" };
  }
}
