// conversationId.ts — a stable per-(user wallet, agent) conversation id so a chat session
// maps to one room on the agent side (runHttpAgent keys chat memory by conversationId).
// Deterministic from the pair so reconnecting within a run lands in the same room.

import { createHash } from "node:crypto";

/** Derive a stable conversation id from the user's wallet address and the agent's wallet. */
export function conversationIdFor(userWallet: string, agentWallet: string): string {
  const digest = createHash("sha256")
    .update(`${userWallet.toLowerCase()}|${agentWallet.toLowerCase()}`)
    .digest("hex");
  return `cli-${digest.slice(0, 24)}`;
}
