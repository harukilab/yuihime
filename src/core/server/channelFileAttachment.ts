import path from "path";
import fs from "fs/promises";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];

// Matches inline file directives such as [[FILE:user_data/laporan.pdf]] or [[FILE:hasil.txt]]
const FILE_DIRECTIVE_REGEX = /\[\[FILE:\s*([^\]]+?)\s*\]\]/gi;

export interface ResolvedAttachment {
  safePath: string;
  isImage: boolean;
}

export interface ExtractedAttachments {
  attachments: ResolvedAttachment[];
  remainingText: string;
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

/**
 * Parses a response text for file attachment directives.
 *
 * Two modes are supported for backward compatibility:
 *  1. Inline directives anywhere in the text: [[FILE:user_data/laporan.pdf]]
 *     - The directive tokens are stripped from the displayed text.
 *     - Both chat text and file attachments can be returned together.
 *  2. Legacy bare-filename response: when the ENTIRE trimmed response is an
 *     existing file path inside the sandbox (no other conversational text).
 *
 * Paths are strictly jailed to the sandbox root to prevent path traversal.
 */
export async function extractChannelFileAttachments(
  responseText: string,
  sandboxDir: string
): Promise<ExtractedAttachments> {
  const attachments: ResolvedAttachment[] = [];
  let remainingText = responseText;

  const resolveOne = async (rawPath: string): Promise<ResolvedAttachment | null> => {
    const trimmed = rawPath.trim();
    if (!trimmed) return null;
    const candidate = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(sandboxDir, trimmed);
    if (!candidate.startsWith(sandboxDir)) return null;
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return { safePath: candidate, isImage: isImageFile(candidate) };
      }
    } catch {
      // Not an accessible file; ignore silently (conversational text, not an attachment).
    }
    return null;
  };

  // Mode 1: inline [[FILE:...]] directives
  const directiveMatches = [...responseText.matchAll(FILE_DIRECTIVE_REGEX)];
  if (directiveMatches.length > 0) {
    for (const match of directiveMatches) {
      const resolved = await resolveOne(match[1]);
      if (resolved) attachments.push(resolved);
    }
    // Strip all directive tokens from the displayed text (multi-line safe)
    remainingText = responseText.replace(FILE_DIRECTIVE_REGEX, "").trim();
  } else {
    // Mode 2: legacy bare-filename response
    const trimmedWhole = responseText.trim();
    if (trimmedWhole) {
      const resolved = await resolveOne(trimmedWhole);
      if (resolved) {
        attachments.push(resolved);
        remainingText = "";
      }
    }
  }

  return { attachments, remainingText };
}
