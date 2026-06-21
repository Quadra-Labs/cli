// session.ts — the process-lifetime services shared across the UI: the loaded config and a
// KeystoreManager. Config is built from env (incl. loaded .env) and then overlaid with persisted
// settings (~/.quadra/config.json, set via the "settings" command), so a key from either source
// is picked up. Holds no secret material itself — the unlocked wallet lives in component state.

import { loadCliConfig, type CliConfig } from "../config/config.js";
import { applySettings, loadSettings } from "../config/settings.js";
import { KeystoreManager } from "../keystore/keystore.js";

export interface Services {
  readonly config: CliConfig;
  readonly keystore: KeystoreManager;
  /** Directory holding the keystore + settings (~/.quadra by default). */
  readonly settingsDir: string;
}

/** Build the shared services from the environment + persisted settings. */
export function createServices(env: NodeJS.ProcessEnv = process.env): Services {
  const base = loadCliConfig(env);
  const config = applySettings(base, loadSettings(base.keystoreDir));
  return { config, keystore: new KeystoreManager(config.keystoreDir), settingsDir: config.keystoreDir };
}

/** Rebuild a config after settings changed at runtime (e.g. the "settings" command). */
export function reloadConfig(base: CliConfig): CliConfig {
  return applySettings(base, loadSettings(base.keystoreDir));
}
