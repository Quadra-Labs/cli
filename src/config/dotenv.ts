// dotenv.ts — a tiny, dependency-free .env loader. The CLI reads process.env, but neither node nor
// tsx auto-loads a .env file, so a key the user wrote there was being ignored. This loads any of
// the given .env files into process.env WITHOUT overriding values already present (a real exported
// env var still wins). Quotes are stripped; blank lines and # comments are skipped.

import { existsSync, readFileSync } from "node:fs";

export function loadDotEnv(paths: string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      const existing = process.env[key];
      if (existing === undefined || existing.length === 0) process.env[key] = value;
    }
  }
}
