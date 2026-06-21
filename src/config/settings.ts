// settings.ts — user-editable settings persisted to ~/.quadra/config.json, set in-app via the
// "settings" command. This is the durable home for the OpenAI API key + model when the CLI is
// installed globally (there is no .env next to the binary). Settings take precedence over .env.
// The file is written 0600; the key is never logged.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { CliConfig } from "./config.js";

export interface Settings {
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
}

const FILE = "config.json";

function settingsPath(dir: string): string {
  return resolve(dir, FILE);
}

/** Load settings, returning an empty object when the file is missing or unreadable. */
export function loadSettings(dir: string): Settings {
  const path = settingsPath(dir);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Settings;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Merge `patch` into the stored settings and persist atomically. Returns the merged settings. */
export function saveSettings(dir: string, patch: Settings): Settings {
  const merged: Settings = { ...loadSettings(dir), ...patch };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = settingsPath(dir);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
  return merged;
}

/** Overlay persisted settings onto a base config (settings win over env/defaults). */
export function applySettings(config: CliConfig, settings: Settings): CliConfig {
  return {
    ...config,
    openaiApiKey: settings.openaiApiKey ?? config.openaiApiKey,
    openaiModel: settings.openaiModel ?? config.openaiModel,
    openaiBaseUrl: settings.openaiBaseUrl ?? config.openaiBaseUrl,
  };
}
