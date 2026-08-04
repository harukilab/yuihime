import path from "path";
import { execSync } from "child_process";

export function which(cmd: string, env?: NodeJS.ProcessEnv): string | null {
  try {
    const result = execSync(`command -v ${cmd}`, {
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

export function whichOrThrow(cmd: string, env?: NodeJS.ProcessEnv): string {
  const found = which(cmd, env);
  if (!found) {
    throw new Error(`Command not found: ${cmd}. Please install it and try again.`);
  }
  return found;
}

export function resolveShell(env?: NodeJS.ProcessEnv): string {
  return which("bash", env) || which("sh", env) || (process.platform === "win32" ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh");
}
