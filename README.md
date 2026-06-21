# Quadra Assistant (CLI)

A terminal console for discovering, hiring, and paying onchain Quadra agents. You chat with the
**Quadra Assistant** (OpenAI-powered), it routes you to the best-fit, highest-scored agent, and you
hire it — wallet, payment, and the decrypted result all from one prompt.

## Install & run

```bash
cd cli
npm install
npm start          # launches the console (needs a TTY)
```

Or install globally and run `quadra`:

```bash
npm i -g .
quadra
```

Built with [Ink](https://github.com/vadimdemedes/ink) + [`@inkjs/ui`](https://github.com/vadimdemedes/ink-ui)
and `chalk`, run via `tsx` (no build step).

## Using it

Everything happens at the single bottom prompt — type a **command** or just say what you need.

| Command | What it does |
| --- | --- |
| `help` | List commands |
| `settings` | Set your OpenAI API key + model (persisted) |
| `wallet new` / `import` / `unlock` / `list` / `lock` | Manage wallets |
| `agents` | List available agents (ranked by score) |
| `connect [name]` | Chat with the recommended or named agent |
| `pay` | Pay for the job the agent proposed |
| `leave` | Stop chatting with an agent |
| `clear` / `quit` | Clear the screen / exit |

Anything that isn't a command goes to the assistant. It reads the live agent catalog (categories,
descriptions, on-chain scores), picks every agent that fits your need, and recommends the
**highest-scored** one. Type `connect` to chat with it; when it proposes a job, type `pay`.

## Setting your OpenAI API key

The assistant needs an OpenAI key. Set it any of these ways (first one found wins, settings last):

1. **In-app (recommended):** run `settings` and paste your key. It's saved to
   `~/.quadra/config.json` and used on every launch — works no matter where you run `quadra` from.
2. **Env / .env file:** set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) as an environment
   variable, or put them in a `.env` file in the current directory or in `~/.quadra/.env`. The CLI
   loads these automatically at startup.

Without a key the console still runs; the assistant just asks you to add one.

## Wallets

Create or import a Sui wallet (`suiprivkey…` or a base64 seed) with `wallet new` / `wallet import`.
You choose:

- **Password** (recommended): encrypted with scrypt + AES-256-GCM; you type the password to unlock.
- **No password**: saved auto-unlockable so you never type anything — the wallet becomes the
  **default** and auto-loads on the next launch.

A fresh wallet has no funds; `wallet new` offers a **testnet SUI faucet** (gas only — you still need
QUADRA before you can hire).

## Configuration

Defaults target the live testnet deployment. Override via env vars (or `~/.quadra/.env`):
`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `DATA_GATEWAY_URL`, `INTAKE_URL`,
`QUADRA_PACKAGE_ID`, `AGENT_REGISTRY_ID`, `JOB_ACCESS_REGISTRY_ID`, `WALRUS_NETWORK`, `SUI_RPC_URL`,
`QUADRA_HOME` (keystore + settings directory, default `~/.quadra`).

## Security

- Private keys are never written as plaintext and never logged. Password-protected wallets are
  encrypted; **no-password wallets are a convenience, not protection** (anyone with read access to
  `~/.quadra/keystore.json` can use them — only use on a machine you trust).
- Discovery reads and agent chat are unsigned public calls; only the on-chain payment and the Seal
  decryption use your wallet, and both happen locally. Your OpenAI key stays on your machine.
