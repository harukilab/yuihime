import { CortexModule, ModuleType } from "@shared/include/types";
import path from "path";
import os from "os";
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { resolveSystemRoot, expandHomePath } from "../core/systemPaths.js";
import { injectCharacterName } from "../core/kernel/characterName.js";

function getSopsDir(): string {
  const customSystemRoot = resolveSystemRoot();
  const resolvedRoot = expandHomePath(customSystemRoot);
  return path.join(resolvedRoot, "user_data", "sops");
}

function getSourceSopsDir(): string {
  const pathsToTry = [
    path.join(os.homedir(), ".yuihime", "user_data", "sops"),
    path.join(process.cwd(), "share", "prompts", "sops"),
    path.join(process.cwd(), "src", "share", "prompts", "sops")
  ];

  for (const p of pathsToTry) {
    if (existsSync(p)) {
      return p;
    }
  }
  return path.join(os.homedir(), ".yuihime", "user_data", "sops");
}

const GENERIC_WORDS = new Set([
  "sop", "default", "general", "main", "base", "basic", "rule", "rules",
  "guide", "guidelines", "file", "folder", "sub", "extra", "example", "examples"
]);

function extractKeywords(filename: string): string[] {
  const base = filename.replace(/\.md$/i, "");
  return base
    .split(/[-_\s]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w));
}

function matchSopFiles(sopFiles: string[], input: string): string[] {
  const inputLower = (input || "").toLowerCase();
  const inputTokens = new Set(inputLower.split(/[^a-z0-9_]+/).filter(Boolean));
  const matched: string[] = [];

  for (const file of sopFiles) {
    const keywords = extractKeywords(file);
    if (keywords.length === 0) continue;
    if (
      keywords.some((kw) => inputLower.includes(kw)) ||
      keywords.some((kw) => inputTokens.has(kw))
    ) {
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
      "Loads relevant SOP files from user_data/sops/ based on user input keywords and injects them as high-priority directives. Files in user_data/sops/always/ are always injected on every cycle.",
    version: "1.1.0",
    type: ModuleType.CORTEX,
    order: 2,
    phase: "aggregation",
  },
  run: async (input: string, state: any, context: any) => {
    const sopsDir = getSopsDir();
    const alwaysDir = path.join(sopsDir, "always");
    let sopFiles: string[] = [];
    let alwaysFiles: string[] = [];

    try {
      if (existsSync(sopsDir)) {
        sopFiles = readdirSync(sopsDir).filter((f) => f.endsWith(".md"));
      }
      if (existsSync(alwaysDir)) {
        alwaysFiles = readdirSync(alwaysDir).filter((f) => f.endsWith(".md"));
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

    const matchedFiles = matchSopFiles([...new Set([...sopFiles, ...sourceSopFiles])], input);
    const selectedFiles = [...alwaysFiles, ...matchedFiles];

    if (selectedFiles.length === 0) {
      const allSops = [...sopFiles, ...sourceSopFiles];
      const defaultSop = allSops.find((f) =>
        f.toLowerCase().includes("default")
      );
      if (defaultSop) {
        selectedFiles.push(defaultSop);
      }
    }

    if (selectedFiles.length === 0) {
      return { ...context };
    }

    let sopContent = "";
    for (const file of selectedFiles) {
      let content: string | null = null;
      let filePath = alwaysFiles.includes(file)
        ? path.join(alwaysDir, file)
        : path.join(sopsDir, file);
      
      try {
        if (existsSync(filePath)) {
          content = readFileSync(filePath, "utf8").trim();
        }
      } catch (err) {
        content = null;
      }

      if (!content && !alwaysFiles.includes(file)) {
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
        sopContent += `\n\n# HIGH-PRIORITY OPERATING PROCEDURE (SOP): ${file}\n${injectCharacterName(content)}`;
      }
    }

    const existingDirective = context.soulDirective || "";
    const updatedDirective = `${sopContent}\n\n${existingDirective}`;

    return {
      ...context,
      soulDirective: updatedDirective,
      sopInjected: selectedFiles.length > 0,
      matchedSops: selectedFiles,
    };
  },
};
