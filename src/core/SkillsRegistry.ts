import fs from "fs";
import path from "path";
import { resolveSystemRoot } from "./systemPaths.js";

export interface SkillDefinition {
  name: string;
  description: string;
  prompt: string;
  version?: string;
  source?: string;
}

// Minimal YAML frontmatter parser for SKILL.md files (Claude Skills format).
function parseSkillFrontmatter(content: string): any {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta: any = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }
    meta[m[1]] = val;
  }
  return meta;
}

/**
 * SkillsRegistry — real Skills system (mirrors the Claude Skills format).
 * Skills are loaded from `<system-root>/skills/<name>/SKILL.md` (or
 * `skill.json`/`manifest.json`) and can be injected into the agent context
 * when the Skill tool is invoked. Also supports in-memory registration at
 * runtime so other modules can contribute skills.
 */
class SkillsRegistryClass {
  private static instance: SkillsRegistryClass;

  private skills: Map<string, SkillDefinition> = new Map();
  private loadedFromDisk = false;

  public static getInstance(): SkillsRegistryClass {
    if (!SkillsRegistryClass.instance) {
      SkillsRegistryClass.instance = new SkillsRegistryClass();
    }
    return SkillsRegistryClass.instance;
  }

  public registerSkill(def: SkillDefinition, overwrite = false): void {
    const key = def.name.trim().toLowerCase();
    if (!key) return;
    if (this.skills.has(key) && !overwrite) return;
    this.skills.set(key, { ...def, name: def.name.trim() });
  }

  public getSkill(name: string): SkillDefinition | undefined {
    if (!this.loadedFromDisk) this.loadFromDisk();
    return this.skills.get(name.trim().toLowerCase());
  }

  public getAll(): SkillDefinition[] {
    if (!this.loadedFromDisk) this.loadFromDisk();
    return Array.from(this.skills.values());
  }

  public listNames(): string[] {
    return this.getAll().map((s) => s.name);
  }

  public skillsDir(): string {
    return path.join(resolveSystemRoot(), "skills");
  }

  /** Reload skills from disk. Returns how many skills were loaded. */
  public loadFromDisk(): number {
    const dir = this.skillsDir();
    this.loadedFromDisk = true;
    let count = 0;
    try {
      if (!fs.existsSync(dir)) return 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(dir, entry.name);
        const def = this.readSkillDir(skillPath, entry.name);
        if (def) {
          this.registerSkill(def, true);
          count++;
        }
      }
    } catch (err: any) {
      console.warn("[SKILLS_REGISTRY] Failed to scan skills directory:", err.message);
    }
    return count;
  }

  private readSkillDir(skillPath: string, dirName: string): SkillDefinition | null {
    const mdPath = path.join(skillPath, "SKILL.md");
    const jsonPath = path.join(skillPath, "skill.json");
    const manifestPath = path.join(skillPath, "manifest.json");

    if (fs.existsSync(mdPath)) {
      try {
        const content = fs.readFileSync(mdPath, "utf-8");
        const fm = parseSkillFrontmatter(content);
        return {
          name: fm.name || dirName,
          description: fm.description || `Skill: ${dirName}`,
          version: fm.version || "1.0.0",
          prompt: content.trim(),
          source: mdPath
        };
      } catch (err: any) {
        console.warn(`[SKILLS_REGISTRY] Failed to parse ${mdPath}:`, err.message);
      }
    }

    const jsonFile = fs.existsSync(jsonPath) ? jsonPath : fs.existsSync(manifestPath) ? manifestPath : null;
    if (jsonFile) {
      try {
        const raw = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
        return {
          name: raw.name || dirName,
          description: raw.description || `Skill: ${dirName}`,
          version: raw.version || "1.0.0",
          prompt: raw.prompt || raw.instructions || raw.systemPrompt || "",
          source: jsonFile
        };
      } catch (err: any) {
        console.warn(`[SKILLS_REGISTRY] Failed to parse ${jsonFile}:`, err.message);
      }
    }

    return null;
  }
}

export const SkillsRegistry = SkillsRegistryClass.getInstance();
