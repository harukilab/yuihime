import { CortexModule, ModuleType } from "@shared/include/types";
import path from "path";
import os from "os";
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { resolveSystemRoot, expandHomePath } from "../core/systemPaths.js";

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
    phase: "aggregation",
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
