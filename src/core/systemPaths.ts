import path from "path";
import os from "os";

export function expandHomePath(inputPath: string): string {
  if (!inputPath) return "";
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  if (inputPath.includes("$HOME")) return inputPath.replace(/\$HOME/g, os.homedir());
  if (inputPath.includes("$home")) return inputPath.replace(/\$home/g, os.homedir());
  if (inputPath.includes("%USERPROFILE%")) return inputPath.replace(/%USERPROFILE%/g, os.homedir());
  return inputPath;
}

function resolveOverride(envName: string): string | null {
  const raw = process.env[envName];
  if (!raw) return null;
  const expanded = expandHomePath(raw.replace(/^['"]|['"]$/g, ""));
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(resolveSystemRoot(), expanded);
}

export function resolveSystemRoot(): string {
  let rootEnv = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || "~/.yuihime";
  rootEnv = rootEnv.replace(/^['"]|['"]$/g, "");
  rootEnv = expandHomePath(rootEnv);
  return path.isAbsolute(rootEnv) ? rootEnv : path.join(os.homedir(), rootEnv);
}

export function resolveDataDir(): string {
  return resolveOverride("YUIHIME_DATA_DIR") || path.join(resolveSystemRoot(), "data");
}

export function resolveAgentDir(): string {
  return resolveOverride("YUIHIME_AGENT_PATH") || path.join(resolveSystemRoot(), "agent");
}

export function resolveAddonsDir(): string {
  return resolveOverride("YUIHIME_ADDONS_PATH") || path.join(resolveSystemRoot(), "addons");
}

export function resolveCortexLoaderDir(): string {
  return resolveOverride("YUIHIME_CORTEX_LOADER_PATH") || path.join(resolveSystemRoot(), "cortexloader");
}

export function resolveDataPath(...segments: string[]): string {
  return path.join(resolveDataDir(), ...segments);
}
