import fs from "fs";
import path from "path";
import { resolveAgentDir } from "../systemPaths.js";

export interface HeartbeatScanResult {
  actionable: boolean;
  prompt?: string;
}

/**
 * Read the agent's HEARTBEAT.md scaffold file.
 */
export function readHeartbeatFile(): string {
  try {
    const p = path.join(resolveAgentDir(), "HEARTBEAT.md");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").trim();
  } catch (err: any) {
    console.warn("[HEARTBEAT] Failed to read HEARTBEAT.md:", err.message);
  }
  return "";
}

/**
 * Scan HEARTBEAT.md for actionable content.
 * Quiet when the file is empty, only headers/comments, or fully checked-off
 * task lists; otherwise produce a heartbeat prompt for the agent.
 */
export function heartbeatScan(): HeartbeatScanResult {
  const content = readHeartbeatFile();
  if (!content) return { actionable: false };

  const body = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*#{1,6}\s.*$/gm, "")
    .trim();
  if (!body) return { actionable: false };

  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { actionable: false };

  const pending = lines.filter((l) => /^[-*]\s*\[[ xX]?\]/.test(l) && !/\[[xX]\]/i.test(l));
  const hasPlainContent = lines.some((l) => !/^[-*]\s*\[[xX]?\]/.test(l));
  if (pending.length === 0 && !hasPlainContent) return { actionable: false };

  return {
    actionable: true,
    prompt: [
      "[HEARTBEAT_SCAN]",
      "",
      "This is a periodic quiet heartbeat check. Review the workspace heartbeat notes below.",
      "If anything is actionable or worth reporting (pending tasks, items needing attention), act on it proactively and deliver a concise result.",
      "If nothing needs attention, reply with exactly the word: HEARTBEAT_SILENT",
      "",
      content,
    ].join("\n"),
  };
}

/**
 * Pick the delivery target for heartbeat reports: the most recently active
 * Telegram user, otherwise nothing (stay silent).
 */
export function resolveHeartbeatTarget(db: any): {
  contextId: string;
  chatType: string;
  senderName: string;
} | null {
  try {
    const tg = db.prepare("SELECT tg_id FROM telegram_users ORDER BY last_seen DESC LIMIT 1").get();
    if (tg && tg.tg_id) {
      return {
        contextId: `tg_${tg.tg_id}`,
        chatType: "Telegram (Private)",
        senderName: "System",
      };
    }
  } catch (err: any) {
    console.warn("[HEARTBEAT] Failed to resolve heartbeat target:", err.message);
  }
  return null;
}
