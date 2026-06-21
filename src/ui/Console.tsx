// Console.tsx — the single-screen REPL: a persistent status header, a scrolling body of output, and
// one bottom prompt that takes either a command (help, settings, wallet, agents, connect, pay, …)
// or natural language (routed to the Quadra Assistant concierge, which recommends the best-fit,
// highest-scored agent and then lets you chat + hire it). Inline questions (passwords, confirms)
// reuse the same bottom prompt so it always feels like one shell.

import { useEffect, useRef, useState } from "react";
import { randomUUID } from "node:crypto";
import { Box, Text, useApp } from "ink";

import { applySettings, loadSettings, saveSettings } from "../config/settings.js";
import { buildCatalog, type Catalog } from "../assistant/agentCatalog.js";
import { routeTurn, type RouterHistoryTurn } from "../assistant/router.js";
import { chatWithAgent, pingAgent, type ProposedJob } from "../quadra/agentChatClient.js";
import { getAgentEndpoint } from "../quadra/gatewayClient.js";
import { payForJob } from "../quadra/payJob.js";
import { startResultPoll, type ResultPollHandle } from "../quadra/resultPoll.js";
import { getWalletBalances } from "../wallet/walletInfo.js";
import { faucetSupported, requestGas } from "../wallet/faucet.js";
import { conversationIdFor } from "../util/conversationId.js";
import { formatQuadra, shortAddress } from "../util/formatSui.js";
import { StatusHeader } from "./components/StatusHeader.js";
import { Prompt } from "./components/Prompt.js";
import { useInputRequest } from "./console/useInputRequest.js";
import type { OutputLine } from "./console/types.js";
import type { Services } from "../state/session.js";
import type { CliConfig } from "../config/config.js";
import type { UnlockedWallet } from "../keystore/keystoreTypes.js";
import type { JobResult, RankedAgentRow } from "../quadra/gatewayTypes.js";

const APP_VERSION = "0.1.0";
const RENDER_TAIL = 300;

const COMMANDS = new Set([
  "help",
  "settings",
  "wallet",
  "agents",
  "browse",
  "connect",
  "pay",
  "leave",
  "back",
  "status",
  "clear",
  "lock",
  "quit",
  "exit",
]);

const isYes = (v: string): boolean => ["y", "yes"].includes(v.trim().toLowerCase());

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function Console({ services }: { services: Services }) {
  const { exit } = useApp();
  const { pending, ask, submit } = useInputRequest();

  const [lines, setLines] = useState<OutputLine[]>([]);
  const [wallet, setWalletS] = useState<UnlockedWallet | undefined>(undefined);
  const [config, setConfigS] = useState<CliConfig>(services.config);
  const [mode, setModeS] = useState<"concierge" | "agent">("concierge");
  const [connected, setConnectedS] = useState<RankedAgentRow | undefined>(undefined);
  const [node, setNodeS] = useState<{ online: boolean; agents: number } | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [inputKey, setInputKey] = useState(0);

  // Refs mirror the values read inside async flows (which span renders).
  const walletRef = useRef<UnlockedWallet | undefined>(undefined);
  const configRef = useRef<CliConfig>(services.config);
  const catalogRef = useRef<Catalog | undefined>(undefined);
  const modeRef = useRef<"concierge" | "agent">("concierge");
  const connectedRef = useRef<RankedAgentRow | undefined>(undefined);
  const endpointRef = useRef<string | undefined>(undefined);
  const jobRef = useRef<ProposedJob | undefined>(undefined);
  const recRef = useRef<RankedAgentRow | undefined>(undefined);
  const historyRef = useRef<RouterHistoryTurn[]>([]);
  const nodeRef = useRef<{ online: boolean; agents: number } | undefined>(undefined);
  const pollRef = useRef<ResultPollHandle | undefined>(undefined);

  const setWallet = (w: UnlockedWallet | undefined): void => {
    walletRef.current = w;
    setWalletS(w);
  };
  const setConfig = (c: CliConfig): void => {
    configRef.current = c;
    setConfigS(c);
  };
  const setMode = (m: "concierge" | "agent"): void => {
    modeRef.current = m;
    setModeS(m);
  };
  const setConnected = (a: RankedAgentRow | undefined): void => {
    connectedRef.current = a;
    setConnectedS(a);
  };
  const setNode = (n: { online: boolean; agents: number } | undefined): void => {
    nodeRef.current = n;
    setNodeS(n);
  };

  const line = (text: string, o: Partial<OutputLine> = {}): OutputLine => ({ id: randomUUID(), text, ...o });
  const push = (text: string, o: Partial<OutputLine> = {}): void => setLines((p) => [...p, line(text, o)]);
  const pushAll = (ls: OutputLine[]): void => setLines((p) => [...p, ...ls]);

  // --- boot ----------------------------------------------------------------
  useEffect(() => {
    pushAll([
      line('Type "help" to get started.', { color: "gray" }),
      line('Tip: set your model and OpenAI API key with the "settings" command.', { color: "gray" }),
      line(""),
    ]);
    const def = services.keystore.getDefault();
    if (def) {
      const sum = services.keystore.list().find((w) => w.name === def);
      if (sum && !sum.protected) {
        const r = services.keystore.unlock(def);
        if (r.ok) setWallet(r.wallet);
      }
    }
    void ensureCatalog(configRef.current).then(() => printStatus());
    return () => pollRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureCatalog(cfg: CliConfig): Promise<void> {
    setBusy("connecting to Quadra…");
    const res = await buildCatalog(cfg);
    setBusy(undefined);
    if (res.ok) {
      catalogRef.current = res.catalog;
      setNode({ online: true, agents: res.catalog.agents.length });
    } else {
      setNode({ online: false, agents: 0 });
    }
  }

  function printStatus(): void {
    const cfg = configRef.current;
    pushAll([
      line("Status", { color: "cyan", bold: true }),
      line(`  API Key   ${cfg.openaiApiKey ? "set" : 'not set — run "settings"'}`, {
        color: cfg.openaiApiKey ? "green" : "yellow",
      }),
      line(
        `  Wallet    ${
          walletRef.current
            ? `${walletRef.current.name} ${shortAddress(walletRef.current.address)}`
            : 'none — run "wallet new"'
        }`,
        { color: walletRef.current ? "green" : "yellow" },
      ),
      line(
        `  Node      ${nodeRef.current?.online ? `online   ${hostOf(cfg.gatewayUrl)}` : "offline"}`,
        { color: nodeRef.current?.online ? "green" : "red" },
      ),
      line(""),
    ]);
    const agents = catalogRef.current?.agents ?? [];
    if (agents.length > 0) {
      push("Agents", { color: "cyan", bold: true });
      for (const a of agents.slice(0, 5)) {
        push(
          `  #${a.rank}  ${a.name.padEnd(20)} ${a.category.padEnd(10)} ${
            a.scoreless ? "scoreless" : `score ${a.overall.toFixed(1)}`
          }`,
          { color: "gray" },
        );
      }
      push("");
    }
  }

  // --- input ---------------------------------------------------------------
  const promptLabel = pending
    ? pending.label
    : mode === "agent" && connected
      ? connected.name
      : "quadra";
  const promptMask = pending?.kind === "password";

  const handleSubmit = (value: string): void => {
    setInputKey((k) => k + 1);
    if (pending) {
      if (pending.kind !== "password" && value.trim().length > 0) {
        push(`  ${value}`, { color: "gray", dim: true });
      }
      submit(value);
      return;
    }
    const text = value.trim();
    if (text.length === 0) return;
    push(`${promptLabel} ▸ ${text}`, { color: "gray", dim: true });
    void route(text);
  };

  async function route(text: string): Promise<void> {
    const tokens = text.split(/\s+/);
    const cmd = (tokens[0] ?? "").toLowerCase();
    if (COMMANDS.has(cmd)) {
      await runCommand(cmd, tokens.slice(1));
      return;
    }
    if (modeRef.current === "agent") return agentChat(text);
    return concierge(text);
  }

  async function runCommand(cmd: string, args: string[]): Promise<void> {
    switch (cmd) {
      case "help":
        return printHelp();
      case "settings":
        return settingsFlow();
      case "wallet":
        return walletCommand(args);
      case "agents":
      case "browse":
        return listAgents();
      case "connect":
        return connectFlow(args[0]);
      case "pay":
        return payFlow();
      case "leave":
      case "back":
        return leaveAgent();
      case "status":
        return printStatus();
      case "clear":
        setLines([]);
        return;
      case "lock":
        setWallet(undefined);
        push("wallet locked", { color: "gray" });
        return;
      case "quit":
      case "exit":
        exit();
        return;
      default:
        return;
    }
  }

  function printHelp(): void {
    pushAll([
      line("Commands", { color: "cyan", bold: true }),
      line("  help                                show this help", { color: "gray" }),
      line("  settings                            set your OpenAI API key + model", { color: "gray" }),
      line("  wallet [new|import|unlock|list|lock] manage wallets", { color: "gray" }),
      line("  agents                              list available agents", { color: "gray" }),
      line("  connect [name]                      chat with the recommended / named agent", { color: "gray" }),
      line("  pay                                 pay for the proposed job", { color: "gray" }),
      line("  leave                               stop chatting with an agent", { color: "gray" }),
      line("  clear                               clear the screen", { color: "gray" }),
      line("  quit                                exit", { color: "gray" }),
      line(""),
      line("Or just type what you need — the assistant will find the right agent.", { color: "gray" }),
      line(""),
    ]);
  }

  // --- settings ------------------------------------------------------------
  async function settingsFlow(): Promise<void> {
    const cur = configRef.current;
    pushAll([
      line("Settings", { color: "cyan", bold: true }),
      line(`  API key   ${cur.openaiApiKey ? "set" : "not set"}`, { color: "gray" }),
      line(`  model     ${cur.openaiModel}`, { color: "gray" }),
    ]);
    const key = await ask("password", "OpenAI API key (blank = keep)");
    if (key.trim().length > 0) saveSettings(services.settingsDir, { openaiApiKey: key.trim() });
    const model = await ask("text", `model [${cur.openaiModel}] (blank = keep)`);
    if (model.trim().length > 0) saveSettings(services.settingsDir, { openaiModel: model.trim() });
    const next = applySettings(cur, loadSettings(services.settingsDir));
    setConfig(next);
    push(`Saved. API key ${next.openaiApiKey ? "set" : "not set"}, model ${next.openaiModel}.`, {
      color: "green",
    });
    if (next.openaiApiKey && !catalogRef.current) await ensureCatalog(next);
  }

  // --- wallet --------------------------------------------------------------
  async function walletCommand(args: string[]): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();
    if (sub === "new") return walletNew();
    if (sub === "import") return walletImport();
    if (sub === "unlock") return walletUnlock();
    if (sub === "list") {
      const l = services.keystore.list();
      if (l.length === 0) push("no wallets — run \"wallet new\"", { color: "gray" });
      else
        pushAll(
          l.map((w) =>
            line(`  ${w.name.padEnd(16)} ${shortAddress(w.address)}  ${w.protected ? "(password)" : "(auto)"}`, {
              color: "gray",
            }),
          ),
        );
      return;
    }
    if (sub === "lock") {
      setWallet(undefined);
      push("wallet locked", { color: "gray" });
      return;
    }
    if (walletRef.current) push(`Wallet "${walletRef.current.name}" — ${walletRef.current.address}`, { color: "gray" });
    else push('No wallet. Run "wallet new", "wallet import", or "wallet unlock".', { color: "gray" });
  }

  async function walletNew(): Promise<void> {
    const name = (await ask("text", "wallet name")).trim();
    if (name.length === 0) return push("cancelled", { color: "gray" });
    const protect = isYes(await ask("confirm", "protect with a password? (y/N)"));
    let pw: string | undefined;
    if (protect) {
      pw = await ask("password", "password");
      const confirm = await ask("password", "confirm password");
      if (pw !== confirm) return push("passwords did not match", { color: "red" });
    }
    const res = services.keystore.create(name, pw);
    if (!res.ok) return push(res.reason, { color: "red" });
    setWallet(res.wallet);
    push(`Created wallet "${name}" — ${res.wallet.address}`, { color: "green" });
    if (!pw) push("Saved without a password; it will auto-unlock next launch.", { color: "gray" });
    if (faucetSupported(configRef.current)) {
      const f = isYes(await ask("confirm", "request testnet SUI for gas? (y/N)"));
      if (f) {
        setBusy("requesting testnet SUI…");
        const r = await requestGas(res.wallet.address, configRef.current);
        setBusy(undefined);
        push(r.ok ? "Requested testnet SUI." : `faucet: ${r.reason}`, { color: r.ok ? "green" : "yellow" });
      }
    }
  }

  async function walletImport(): Promise<void> {
    const name = (await ask("text", "wallet name")).trim();
    if (name.length === 0) return push("cancelled", { color: "gray" });
    const secret = await ask("password", "private key (suiprivkey… or base64, hidden)");
    const protect = isYes(await ask("confirm", "protect with a password? (y/N)"));
    const pw = protect ? await ask("password", "password") : undefined;
    const imp = services.keystore.import(name, secret, pw);
    if (!imp.ok) return push(imp.reason, { color: "red" });
    const u = services.keystore.unlock(name, pw);
    if (u.ok) {
      setWallet(u.wallet);
      push(`Imported "${name}" — ${u.wallet.address}`, { color: "green" });
    } else push(u.reason, { color: "red" });
  }

  async function walletUnlock(): Promise<void> {
    const list = services.keystore.list();
    if (list.length === 0) return push('No saved wallets. Run "wallet new" or "wallet import".', { color: "gray" });
    const name = (await ask("text", `unlock which? [${list.map((w) => w.name).join(", ")}]`)).trim();
    const sum = list.find((w) => w.name === name);
    if (!sum) return push(`no wallet named "${name}"`, { color: "red" });
    const pw = sum.protected ? await ask("password", "password") : undefined;
    const u = services.keystore.unlock(name, pw);
    if (u.ok) {
      setWallet(u.wallet);
      push(`Unlocked "${name}" — ${u.wallet.address}`, { color: "green" });
    } else push(u.reason, { color: "red" });
  }

  // --- agents / concierge / chat / hire ------------------------------------
  function listAgents(): void {
    const agents = catalogRef.current?.agents ?? [];
    if (agents.length === 0) return push("No agents available yet.", { color: "gray" });
    push("Agents", { color: "cyan", bold: true });
    for (const a of agents.slice(0, 10)) {
      push(
        `  #${a.rank}  ${a.name.padEnd(20)} ${a.category.padEnd(10)} ${
          a.scoreless ? "scoreless" : `score ${a.overall.toFixed(1)}`
        }  ${a.jobs} jobs`,
        { color: "gray" },
      );
    }
    push('Type "connect <name>" or just tell the assistant what you need.', { color: "gray" });
  }

  async function concierge(text: string): Promise<void> {
    const cfg = configRef.current;
    if (!cfg.openaiApiKey) return push('No OpenAI API key. Run "settings" to add one.', { color: "yellow" });
    if (!catalogRef.current) return push("Still connecting to the node…", { color: "gray" });
    setBusy("thinking…");
    const res = await routeTurn({
      config: cfg,
      catalog: catalogRef.current,
      history: historyRef.current,
      userMessage: text,
    });
    setBusy(undefined);
    if (!res.ok) return push(`assistant error: ${res.reason}`, { color: "red" });
    push(`assistant  ${res.reply}`, { color: "cyan" });
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: text },
      { role: "assistant", content: res.reply },
    ];
    if (res.recommended) {
      recRef.current = res.recommended;
      const alt = res.alternates.length > 0 ? ` (+${res.alternates.length} more)` : "";
      push(
        `→ Best match: ${res.recommended.name} · score ${res.recommended.overall.toFixed(1)} · ${res.recommended.jobs} jobs${alt}. Type "connect" to chat.`,
        { color: "green" },
      );
    } else {
      recRef.current = undefined;
    }
  }

  async function connectFlow(arg: string | undefined): Promise<void> {
    const agents = catalogRef.current?.agents ?? [];
    const target = arg
      ? agents.find(
          (a) => a.name.toLowerCase() === arg.toLowerCase() || `#${a.rank}` === arg || a.wallet === arg,
        )
      : recRef.current;
    if (!target) return push('Nothing to connect to. Ask the assistant, or run "agents".', { color: "yellow" });
    setBusy(`connecting to ${target.name}…`);
    const ep = await getAgentEndpoint(configRef.current, target.wallet);
    if (!ep.ok || !ep.data) {
      setBusy(undefined);
      return push(`${target.name} has not published a chat endpoint (offline).`, { color: "red" });
    }
    const ping = await pingAgent(ep.data.url);
    setBusy(undefined);
    if (!ping.ok || ping.ping.ready === false) return push(`${target.name} is offline right now.`, { color: "red" });
    endpointRef.current = ep.data.url;
    setConnected(target);
    setMode("agent");
    push(`Connected to ${target.name}. Describe the job you want; type "leave" to go back.`, { color: "green" });
  }

  async function agentChat(text: string): Promise<void> {
    const ep = endpointRef.current;
    const agent = connectedRef.current;
    if (!ep || !agent) return push("not connected to an agent", { color: "red" });
    setBusy(`${agent.name} is thinking…`);
    const userId = walletRef.current?.address ?? "cli-anon";
    const res = await chatWithAgent(ep, {
      message: text,
      conversationId: conversationIdFor(userId, agent.wallet),
      user: userId,
    });
    setBusy(undefined);
    if (!res.ok) return push(`agent error: ${res.reason}`, { color: "red" });
    if (res.reply.reply) push(`${agent.name}  ${res.reply.reply}`, { color: "magenta" });
    for (const n of res.reply.notes) push(`· ${n}`, { color: "yellow", dim: true });
    if (res.reply.job) {
      jobRef.current = res.reply.job;
      push(`This job costs ${formatQuadra(res.reply.job.cost)} QUADRA. Type "pay" to pay and run it.`, {
        color: "green",
      });
    }
  }

  function leaveAgent(): void {
    setMode("concierge");
    setConnected(undefined);
    endpointRef.current = undefined;
    push("Left the agent chat.", { color: "gray" });
  }

  async function payFlow(): Promise<void> {
    const job = jobRef.current;
    if (!job) return push("No job to pay for. Ask the agent to scope a job first.", { color: "yellow" });
    const w = walletRef.current;
    if (!w) return push('You need a wallet to pay. Run "wallet new", "wallet import", or "wallet unlock".', { color: "yellow" });

    setBusy("reading balances…");
    const bal = await getWalletBalances(w.address, configRef.current);
    setBusy(undefined);
    if (!bal.ok) return push(`balance check failed: ${bal.reason}`, { color: "red" });
    const cost = BigInt(Math.round(job.cost));
    if (bal.balances.quadraBase < cost) {
      return push(
        `Insufficient QUADRA (have ${formatQuadra(bal.balances.quadraBase)}, need ${formatQuadra(job.cost)}). Acquire QUADRA first — the faucet only mints SUI gas.`,
        { color: "red" },
      );
    }
    if (bal.balances.suiMist === 0n && faucetSupported(configRef.current)) {
      const f = isYes(await ask("confirm", "No SUI for gas. Request testnet SUI now? (y/N)"));
      if (f) {
        setBusy("requesting testnet SUI…");
        await requestGas(w.address, configRef.current);
        setBusy(undefined);
      }
    }
    const ok = isYes(
      await ask("confirm", `Pay ${formatQuadra(job.cost)} QUADRA to ${connectedRef.current?.name ?? "the agent"}? (y/N)`),
    );
    if (!ok) return push("cancelled", { color: "gray" });

    setBusy("paying (pay_for_job)…");
    const pay = await payForJob({
      signer: w.signer,
      network: configRef.current.network,
      quadraPackageId: configRef.current.quadraPackageId,
      agentRegistryId: configRef.current.agentRegistryId,
      jobAccessRegistryId: configRef.current.jobAccessRegistryId,
      sessionId: job.session_id,
      jobId: job.job_id,
      agentWallet: job.agent_wallet,
      cost: job.cost,
      ...(configRef.current.suiRpcUrl ? { suiRpcUrl: configRef.current.suiRpcUrl } : {}),
    });
    if (!pay.ok) {
      setBusy(undefined);
      return push(`payment failed: ${pay.message}`, { color: "red" });
    }
    push(`Paid · ${pay.digest.slice(0, 16)}…`, { color: "green" });
    pollRef.current = startResultPoll({
      config: configRef.current,
      jobId: job.job_id,
      signer: w.signer,
      onPhase: (p, e) =>
        setBusy(p === "decrypting" ? "decrypting result…" : `waiting for delivery… (${Math.floor(e / 1000)}s)`),
      onDone: (result) => {
        setBusy(undefined);
        jobRef.current = undefined;
        printResult(result);
      },
      onError: (reason, timedOut) => {
        setBusy(undefined);
        push(timedOut ? reason : `result error: ${reason}`, { color: timedOut ? "yellow" : "red" });
      },
    });
  }

  function printResult(result: JobResult): void {
    pushAll([
      line("Result delivered", { color: "green", bold: true }),
      line(`  ${JSON.stringify(result.agent_result)}`, { color: "white" }),
    ]);
    if (result.score > 0) push(`  score ${result.score}`, { color: "cyan" });
    push("");
  }

  // --- render --------------------------------------------------------------
  const walletLabel = wallet ? shortAddress(wallet.address) : "locked";
  const visible = lines.length > RENDER_TAIL ? lines.slice(-RENDER_TAIL) : lines;

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <StatusHeader
        version={APP_VERSION}
        walletLabel={walletLabel}
        agents={node?.agents}
        nodeHost={hostOf(config.gatewayUrl)}
        nodeOnline={node?.online}
      />
      <Box flexDirection="column" marginTop={1}>
        {visible.map((l) => (
          <Text key={l.id} color={l.color} dimColor={l.dim} bold={l.bold}>
            {l.text.length > 0 ? l.text : " "}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Prompt label={promptLabel} mask={promptMask} busy={busy} inputKey={inputKey} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
