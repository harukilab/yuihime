import { CortexModule, ModuleType } from "@shared/include/types";
import path from "path";
import os from "os";
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";

function resolveHomePath(inputPath: string): string {
  if (!inputPath) return "";
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function getSopsDir(): string {
  const rootEnvStr =
    process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || "~/.yuihime";
  const customSystemRoot = path.isAbsolute(rootEnvStr)
    ? rootEnvStr
    : path.join(process.cwd(), rootEnvStr);
  const resolvedRoot = resolveHomePath(customSystemRoot);
  return path.join(resolvedRoot, "user_data", "sops");
}

function getSourceSopsDir(): string {
  let localDirname = "";
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      localDirname = path.dirname(fileURLToPath(import.meta.url));
    } else {
      localDirname = process.cwd();
    }
  } catch (e) {
    localDirname = process.cwd();
  }

  const pathsToTry = [
    path.join(localDirname, "..", "..", "..", "share", "prompts", "sops"),
    path.join(localDirname, "..", "..", "share", "prompts", "sops"),
    path.join(localDirname, "..", "share", "prompts", "sops"),
    path.join(process.cwd(), "src", "share", "prompts", "sops"),
    path.join(process.cwd(), "share", "prompts", "sops")
  ];

  for (const p of pathsToTry) {
    if (existsSync(p)) {
      return p;
    }
  }
  return pathsToTry[0];
}

function extractKeywords(filename: string): string[] {
  const base = filename.replace(/\.md$/i, "");
  return base
    .split(/[-_\s]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2);
}

function matchSopFiles(sopFiles: string[], input: string): string[] {
  const inputLower = (input || "").toLowerCase();
  const matched: string[] = [];

  for (const file of sopFiles) {
    const keywords = extractKeywords(file);
    if (keywords.some((kw) => inputLower.includes(kw))) {
      matched.push(file);
    }
  }

  return matched;
}

export const SOPModule: CortexModule = {
  metadata: {
    id: "dynamic-sop-loader",
    name: "Dynamic SOP Loader",
    description:
      "Loads relevant SOP files from user_data/sops/ based on user input keywords and injects them as high-priority directives.",
    version: "1.0.0",
    type: ModuleType.CORTEX,
    order: 2,
    phase: "PHASE 1: AGGREGATION",
  },
  run: async (input: string, state: any, context: any) => {
    const sopsDir = getSopsDir();
    let sopFiles: string[] = [];

    try {
      if (existsSync(sopsDir)) {
        sopFiles = readdirSync(sopsDir).filter((f) => f.endsWith(".md"));
      }
    } catch (err) {
      return { ...context };
    }

    let sopSourceDir = getSourceSopsDir();
    let sourceSopFiles: string[] = [];
    try {
      if (existsSync(sopSourceDir)) {
        sourceSopFiles = readdirSync(sopSourceDir).filter((f) => f.endsWith(".md"));
      }
    } catch (err) {
      sourceSopFiles = [];
    }

    let matchedFiles = matchSopFiles([...new Set([...sopFiles, ...sourceSopFiles])], input);

    if (matchedFiles.length === 0) {
      const allSops = [...sopFiles, ...sourceSopFiles];
      const defaultSop = allSops.find((f) =>
        f.toLowerCase().includes("default")
      );
      if (defaultSop) {
        matchedFiles = [defaultSop];
      }
    }

    if (matchedFiles.length === 0) {
      return { ...context };
    }

    let sopContent = "";
    for (const file of matchedFiles) {
      let content: string | null = null;
      let filePath = path.join(sopsDir, file);
      
      try {
        if (sopFiles.includes(file) && existsSync(filePath)) {
          content = readFileSync(filePath, "utf8").trim();
        }
      } catch (err) {
        content = null;
      }

      if (!content) {
        filePath = path.join(sopSourceDir, file);
        try {
          if (sourceSopFiles.includes(file) && existsSync(filePath)) {
            content = readFileSync(filePath, "utf8").trim();
          }
        } catch (err) {
          content = null;
        }
      }

      if (content) {
        sopContent += `\n\n# PRIORITAS UTAMA OPERASIONAL (SOP): ${file}\n${content}`;
      }
    }

    const existingDirective = context.soulDirective || "";
    const updatedDirective = `${sopContent}\n\n${existingDirective}`;

    return {
      ...context,
      soulDirective: updatedDirective,
      sopInjected: matchedFiles.length > 0,
      matchedSops: matchedFiles,
    };
  },
};
