// boot.ts — import-once side effects that must run before any config read or network client.
// 1) Load .env files into process.env (the CLI never auto-loaded them, so a key set in .env was
//    being ignored). Looks in the current directory and ~/.quadra. Real exported env vars win.
// 2) Force IPv4-first DNS so localhost agents (which bind IPv4) connect reliably
//    (memory: localhost-ipv4-first-and-stale-menu). Harmless for remote HTTPS hosts.

import { setDefaultResultOrder } from "node:dns";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadDotEnv } from "./config/dotenv.js";

loadDotEnv([join(process.cwd(), ".env"), join(homedir(), ".quadra", ".env")]);

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Older Node without this API: ignore; remote HTTPS hosts are unaffected.
}
