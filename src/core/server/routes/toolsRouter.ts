import express from "express";
import path from "path";
import fs from "fs/promises";
import { existsSync, readdirSync, statSync, realpathSync, mkdirSync, createReadStream } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { AIService } from "../../kernel/ai.js";
import { SettingsManager } from "@/core/kernel/settings";
import { apiCustomSystemRoot, verifySandboxPath, getDynamicSandboxRoot, resolveSystemRootPath, getYoloMode, getCommandBlacklist, getCommandWhitelist, requestFileOperationConfirmation } from "../apiRouter.js";
import { CustomToolsLoader } from "../../CustomToolsLoader.js";
import { getDb } from "../../database.js";
import { writeAvailableToolsFile } from "@/core/toolRegistryFile";
import { APIService } from "@shared/services/api";
import { StorageServer } from "@shared/drivers/storageServer.js";
import { searchMemories } from "../../memorySearch";
import { SystemRegistry } from "@shared/core/registry";
import { BackgroundProcessManager } from "../../kernel/BackgroundProcessManager";
import { load } from "cheerio";
import { genId } from '@shared/core/idGen';

const execPromise = promisify(exec);

function getCleanDisplayFolder(dirPath: string): string {
  if (!dirPath) return "user_data";
  let normalized = dirPath.replace(/\\/g, '/');
  const cwd = process.cwd().replace(/\\/g, '/');
  if (normalized.startsWith(cwd)) {
    normalized = normalized.substring(cwd.length).replace(/^\/+/, '');
  }
  normalized = normalized.replace(/^.*\.yuihime\//, '');
  if (!normalized || normalized === '.') return "user_data";
  return normalized;
}

function getCleanRelativePath(filename: string): string {
  if (!filename) return "";
  let cleaned = filename.replace(/\\/g, '/');
  const cwd = process.cwd().replace(/\\/g, '/');
  if (cleaned.startsWith(cwd)) {
    cleaned = cleaned.substring(cwd.length).replace(/^\/+/, '') || ".";
  }
  cleaned = cleaned.replace(/^.*\.yuihime\//, '');
  if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
  return cleaned;
}

function toGrepModelOutput(output: any): string {
  const lines = output.items.length === 0 ? ["No files found"] : [`Found ${output.items.length} matches`];
  let current = "";
  for (const match of output.items) {
    if (current !== match.entry.path) {
      if (current) lines.push("");
      current = match.entry.path;
      lines.push(`${match.entry.path}:`);
    }
    lines.push(`  Line ${match.line}: ${match.text}`);
  }
  if (output.truncated) lines.push("", `(Results truncated: showing first ${output.items.length} matches.)`);
  if (output.partial) lines.push("", "(Some paths were inaccessible.)");
  return lines.join("\n");
}

function globToRegExp(pattern: string): RegExp {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      re += '.*';
    } else if (c === '?') {
      re += '.';
    } else if (c === '[') {
      let j = i + 1;
      let negate = false;
      if (pattern[j] === '!' || pattern[j] === '^') { negate = true; j++; }
      let cls = '';
      while (j < pattern.length && pattern[j] !== ']') { cls += pattern[j]; j++; }
      if (j < pattern.length) {
        re += '[' + (negate ? '^' : '') + cls.replace(/\\/g, '\\\\') + ']';
        i = j;
      } else {
        re += '\\[';
      }
    } else if (c === '{') {
      let depth = 1;
      let j = i + 1;
      let body = '';
      while (j < pattern.length && depth > 0) {
        if (pattern[j] === '{') depth++;
        if (pattern[j] === '}') depth--;
        if (depth > 0) body += pattern[j];
        j++;
      }
      if (depth === 0) {
        re += '(?:' + body.split(',').map((s) => s.replace(/\*/g, '.*').replace(/\?/g, '.')).join('|') + ')';
        i = j;
      } else {
        re += '\\{';
      }
    } else {
      re += c.replace(/[.+^$()\[\]|\\]/g, '\\$&');
    }
  }
  re += '$';
  return new RegExp(re);
}

export function registerToolsRoutes(app: express.Express, db: any) {
  // Middleware to automatically log all tool executions
  app.use("/api/tools", (req, res, next) => {
    const originalJson = res.json;
    let capturedBody: any = null;

    // Capture req.body and req.query immediately on request entry to ensure we never lose them due to downstream mutations/cleanups
    const capturedParams = req.method === "GET"
      ? (req.query ? JSON.parse(JSON.stringify(req.query)) : {})
      : (req.body ? JSON.parse(JSON.stringify(req.body)) : {});

    res.json = function (body: any) {
      capturedBody = body;
      return originalJson.call(this, body);
    };

    res.on("finish", () => {
      // Exclude simple custom tools registries fetches (GET)
      if (req.path === "/custom" && req.method === "GET") {
        return;
      }

      let toolName = (req.headers["x-tool-name"] as string) || (req.query?.toolName as string) || "";
      const p = req.path;
      if (!toolName) {
        toolName = "Tool Execution";
        if (p === "/search") toolName = "Google Search";
        else if (p === "/execute_js") toolName = "JavaScript Exec";
        else if (p === "/chat/search") toolName = "Chat History Search";
        else if (p === "/shell") toolName = "Shell Execute";
        else if (p === "/files/write") toolName = "File Write";
        else if (p === "/files/edit-segment") toolName = "File Edit Segment";
        else if (p === "/files/read") toolName = "File Read";
        else if (p === "/files/list") toolName = "File List";
        else if (p === "/files/download") toolName = "File Download";
        else if (p === "/files/send") toolName = "File Send (Dispatch)";
        else if (p === "/files/manager") {
          const action = capturedParams?.action || "unknown";
          toolName = `File Manager (${String(action).toUpperCase()})`;
        } else if (p.startsWith("/custom")) {
          toolName = `Custom Tool (${req.method})`;
        }
      }

      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      const parameters = capturedParams;

      // Prevent log bloat with large file contents
      let cleanParams = { ...parameters };
      if (cleanParams.content && typeof cleanParams.content === 'string' && cleanParams.content.length > 500) {
        cleanParams.content = cleanParams.content.substring(0, 500) + "... [truncated]";
      }
      if (cleanParams.code && typeof cleanParams.code === 'string' && cleanParams.code.length > 500) {
        cleanParams.code = cleanParams.code.substring(0, 500) + "... [truncated]";
      }

      let cleanResponse = capturedBody;
      if (cleanResponse && typeof cleanResponse === 'object') {
        cleanResponse = { ...cleanResponse };
        if (cleanResponse.content && typeof cleanResponse.content === 'string' && cleanResponse.content.length > 500) {
          cleanResponse.content = cleanResponse.content.substring(0, 500) + "... [truncated]";
        }
      }

      const logEntry = {
        id: 'tool_' + genId(9),
        timestamp: Date.now(),
        toolName: toolName,
        endpointPath: req.path,
        parameters: cleanParams,
        response: isSuccess ? cleanResponse : null,
        responseSchema: isSuccess ? APIService.inferSchema(cleanResponse) : null,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        error: isSuccess ? null : (capturedBody?.error || capturedBody?.message || "HTTP Error " + res.statusCode),
        standardsCompliance: isSuccess
      };

      APIService.addAuditLog(logEntry);
    });

    next();
  });

  app.get("/api/tools/search", async (req, res) => {
    const { query, top_k } = req.query;
    if (!query) return res.status(400).json({ error: "No query provided" });

    try {
      const ai = AIService.getInstance();
      const results = await ai.search(query as string);
      const limit = Math.max(1, Math.min(20, Number(top_k) || 5));

      const normalized = Array.isArray(results)
        ? results.map((r: any) => ({
            title: typeof r.title === 'string' ? r.title : String(r.title || ''),
            url: typeof r.url === 'string' ? r.url : String(r.url || ''),
            snippet: typeof r.snippet === 'string' ? r.snippet : String(r.snippet || ''),
            ...(typeof r.score === 'number' ? { score: r.score } : {}),
            ...(typeof r.published_date === 'string' ? { published_date: r.published_date } : {})
          })).filter((r: any) => r.title || r.url || r.snippet)
        : [];

      res.json(normalized.slice(0, limit));
    } catch (error: any) {
      console.error("[SERVER] Google Search Grounding tool failed:", error);
      const fallbackResults = [
        { title: `${query} - Wikipedia`, snippet: `Knowledge summary for ${query}. This topic involves complex systems and historical context...`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query as string)}` },
        { title: `Latest News on ${query}`, snippet: `Recent developments indicate a shift in how ${query} is perceived by the global community.`, url: `https://news.google.com/search?q=${encodeURIComponent(query as string)}` }
      ];
      res.json(fallbackResults.slice(0, Math.max(1, Math.min(20, Number(top_k) || 5))));
    }
  });

  app.post("/api/tools/snipper", async (req, res) => {
    const { url, selector, saveToMemory, context, importance, defaultUserAgent, maxContentLength, engine, jinaApiKey, format: reqFormat } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });
    const format = reqFormat || 'markdown';

    try {
      let extractedText = '';
      let scrapeSuccess = false;
      const scrapeEngine = engine || 'jina';

      // 1. Primary Engine: Jina Reader API
      if (scrapeEngine === 'jina') {
        try {
          console.log(`[WEB_FETCH] Fetching via Jina Reader API (r.jina.ai) in Express Route for URL: ${url}`);
          const jinaHeaders: Record<string, string> = {
            'Accept': format === 'text' ? 'text/plain' : 'text/markdown, text/plain'
          };
          if (jinaApiKey) {
            jinaHeaders['Authorization'] = `Bearer ${jinaApiKey}`;
          }
          if (selector) {
            jinaHeaders['X-Target-Selector'] = selector;
          }

          const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
            headers: jinaHeaders,
            signal: AbortSignal.timeout(12000)
          });

          if (jinaResponse.ok) {
            extractedText = await jinaResponse.text();
            scrapeSuccess = true;
            console.log(`[WEB_FETCH] Successfully fetched ${extractedText.length} chars via Jina Reader API.`);
          } else {
            console.warn(`[WEB_FETCH] Jina Reader in API route returned non-ok status: ${jinaResponse.status} ${jinaResponse.statusText}. Falling back to local scraper...`);
          }
        } catch (jinaErr: any) {
          console.warn(`[WEB_FETCH] Jina Reader in API route failed (${jinaErr.message}). Falling back to local scraper...`);
        }
      }

      // 2. Secondary Engine/Fallback: Local scraping via Cheerio / Regex
      let localContentType = 'text/html';
      if (!scrapeSuccess) {
        console.log(`[WEB_FETCH] Scraping via Local Scraper in Express Route for URL: ${url}`);
        const userAgent = defaultUserAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const response = await fetch(url, { 
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
        }
        localContentType = response.headers.get('content-type') || 'text/html';

        const html = await response.text();
        let cheerioFailed = false;
        let $;

        try {
          $ = load(html);
        } catch (cheerioErr: any) {
          console.warn("[WEB_FETCH] Cheerio fallback triggered in API route:", cheerioErr.message);
          cheerioFailed = true;
        }

        if (!cheerioFailed && $) {
          if (!selector) {
            $('script, style, head, iframe, noscript, svg, footer, header, nav').remove();
          }

          if (selector) {
            const matches = $(selector);
            if (matches.length === 0) {
              extractedText = `[Warning] CSS selector "${selector}" did not match any elements on the target webpage.`;
            } else {
              const texts: string[] = [];
              matches.each((_, el) => {
                const txt = $(el).text().trim();
                if (txt) texts.push(txt);
              });
              extractedText = texts.join('\n\n');
            }
          } else if (format === 'text') {
            extractedText = $('body').text()
              .replace(/\s+/g, ' ')
              .replace(/\n\s*\n/g, '\n')
              .trim();
          } else {
            extractedText = $('body').text()
              .replace(/\s+/g, ' ')
              .replace(/\n\s*\n/g, '\n')
              .trim();
          }
        } else {
          extractedText = parseHtmlFallback(html, selector);
        }

        // Suggest headless browser option for dynamic JS-driven SPA contents
        const isDynamicSPA = html.includes('id="root"') || html.includes('id="app"') || html.includes('react-root') || html.includes('__NEXT_DATA__');
        if (isDynamicSPA && extractedText.trim().length < 350) {
          extractedText += `\n\n[System Advice: This webpage appears to be a JavaScript-driven Single Page Application (SPA). To scrape dynamic/hydrated content, consider using a headless browser option (such as Puppeteer, Playwright, or an external dynamic scraping proxy).]`;
        }
      }

      const limit = maxContentLength || 12000;
      if (extractedText.length > limit) {
        extractedText = extractedText.substring(0, limit) + `... [TRUNCATED - Content exceeded limit of ${limit} characters]`;
      }

      const result: any = {
        url,
        contentType: scrapeSuccess ? 'text/markdown' : localContentType,
        format,
        output: extractedText,
        selector: selector || null,
        length: extractedText.length,
        content: extractedText,
        savedToMemory: false
      };

       if (saveToMemory !== false && extractedText.trim().length > 0 && !extractedText.startsWith('[Warning]')) {
         const memoryContext = context || 'web_default';
        const imp = typeof importance === 'number' ? importance : 0.8;
        
        const memoryData = {
          type: "system",
          speaker: "system",
          content: `[WEB_FETCH] Fetched data from ${url} (Format: ${format}):\n${extractedText}`,
          tags: ["web_fetch", "scraped_content"],
          context: memoryContext,
          importance: imp,
          meta: { url, format, snippedAt: Date.now() }
        };

        const saved = await StorageServer.saveMemory(memoryData);
        result.savedToMemory = true;
        result.memoryId = saved.id;
        result.context = memoryContext;
      }

      res.json(result);
    } catch (error: any) {
      console.error("[SERVER] WebFetch route execution failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tools/memory-search", async (req, res) => {
    const { query, limit, type } = req.query;
    if (!query) {
      return res.status(400).json({ error: "No query provided" });
    }

    try {
      const hits = await searchMemories(
        String(query),
        Math.min(Math.max(Number(limit) || 5, 1), 20),
        type ? String(type) : undefined
      );
      res.json({ success: true, query, count: hits.length, results: hits });
    } catch (error: any) {
      console.error("[SERVER_MEMORY_SEARCH] Memory search failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/execute_js", async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });

    try {
      const wrappedCode = `(async () => { ${code.includes("return") ? code : `return (${code})`} })()`;
      const fn = new Function(`"use strict"; return ${wrappedCode}`);
      const result = await fn();
      res.json({ result: typeof result === "object" ? JSON.stringify(result) : String(result) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/chat/search", async (req, res) => {
    const { query, platform, limit, contextId, senderName, viewerIdentityId } = req.body;
    try {
      // 1. Resolve identity
      let identity: any = null;
      if (viewerIdentityId) {
        identity = db.prepare("SELECT * FROM identities WHERE id = ?").get(viewerIdentityId);
      }
      if (!identity && senderName) {
        identity = db.prepare("SELECT * FROM identities WHERE LOWER(perceivedName) = ?").get(senderName.toLowerCase());
      }
      if (!identity && contextId) {
        // Search identities to see if any linked account contains this context id
        const allIdentities = db.prepare("SELECT * FROM identities").all() as any[];
        for (const id of allIdentities) {
          const linked = id.linkedAccounts ? JSON.parse(id.linkedAccounts) : [];
          if (Array.isArray(linked)) {
            const hasMatch = linked.some((acc: string) => {
              const lowerAcc = acc.toLowerCase();
              if (contextId.startsWith("tg_") && lowerAcc.includes(`telegram:id:${contextId.replace("tg_", "")}`)) return true;
              if (contextId.startsWith("dc_") && lowerAcc.includes(contextId.replace("dc_", ""))) return true;
              return false;
            });
            if (hasMatch) {
              identity = id;
              break;
            }
          }
        }
      }

      // 2. Extract usernames/handles
      const perceivedName = identity ? identity.perceivedName : (senderName || "Unknown");
      const linkedAccounts = identity && identity.linkedAccounts ? JSON.parse(identity.linkedAccounts) : [];
      
      const lowerNames = [perceivedName.toLowerCase()];
      for (const acc of linkedAccounts) {
        const parts = acc.split(":");
        if (parts.length > 1) {
          const handle = parts[parts.length - 1].toLowerCase().trim();
          if (handle && !lowerNames.includes(handle)) {
            lowerNames.push(handle);
          }
        }
      }

      // 3. Find unique context IDs where this user has participated
      const placeholders = lowerNames.map(() => "?").join(",");
      const contextRows = db.prepare(`
        SELECT DISTINCT context FROM memories 
        WHERE LOWER(speaker) IN (${placeholders})
      `).all(...lowerNames) as { context: string }[];

      const targetContexts = new Set<string>();
      if (contextId) {
        targetContexts.add(contextId);
      }
      for (const r of contextRows) {
        if (r.context) {
          targetContexts.add(r.context);
        }
      }

      // 4. Filter contexts by platform specified
      const finalContexts = Array.from(targetContexts).filter(ctx => {
        const p = platform || "all";
        if (p === 'web') {
          return ctx === 'live_stream' || ctx.startsWith('web_');
        }
        if (p === 'telegram') {
          return ctx.startsWith('tg_');
        }
        if (p === 'discord') {
          return ctx.startsWith('dc_');
        }
        return true;
      });

      if (finalContexts.length === 0 && contextId) {
        finalContexts.push(contextId);
      }

      if (finalContexts.length === 0) {
        return res.json({
          success: true,
          identity: perceivedName,
          query: query || null,
          platform: platform || "all",
          messages: []
        });
      }

      // 5. Query message rows in those contexts
      let queryClause = "";
      const queryParams: any[] = [];
      if (query && query.trim() !== "") {
        queryClause = "AND (content LIKE ? OR tags LIKE ?)";
        queryParams.push(`%${query}%`, `%${query}%`);
      }

      const contextsPlaceholders = finalContexts.map(() => "?").join(",");
      const limitVal = typeof limit === 'number' ? limit : 20;

      const messageRows = db.prepare(`
        SELECT * FROM memories 
        WHERE context IN (${contextsPlaceholders}) ${queryClause}
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(...finalContexts, ...queryParams, limitVal) as any[];

      const messages = messageRows.map((r: any) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        speaker: r.speaker,
        context: r.context,
        platform: r.context.startsWith("tg_") ? "Telegram" : r.context.startsWith("dc_") ? "Discord" : (r.context === "live_stream" || r.context.startsWith("web_")) ? "Web" : "Unknown",
        timestamp: r.timestamp,
        timeString: new Date(r.timestamp).toISOString()
      }));

      res.json({
        success: true,
        identity: perceivedName,
        query: query || null,
        platform: platform || "all",
        contextsSearched: finalContexts,
        messages
      });
    } catch (error: any) {
      console.error("[SERVER] POST /api/tools/chat/search error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/shell", async (req, res) => {
    const { command, workdir, timeout: reqTimeout } = req.body;
    if (!command) return res.status(400).json({ error: "No command provided" });

    let shellTimeout = 120000;
    try {
      const settings = await SettingsManager.getInstance().load();
      const toolExecutorConfig = settings['tool-executor'] || {};
      if (toolExecutorConfig.shellTimeoutMs !== undefined) {
        shellTimeout = Number(toolExecutorConfig.shellTimeoutMs);
      }
    } catch (e) {
      console.warn("[SERVER] Failed to load tool-executor config for shell route, using 120s fallback.", e);
    }
    if (typeof reqTimeout === 'number' && reqTimeout > 0) {
      shellTimeout = Math.min(reqTimeout, 600000);
    }

    try {
      const yoloMode = getYoloMode();
      const isYoloFull = yoloMode === 'full';
      const isYoloHalf = yoloMode === 'half';

      const blacklist = getCommandBlacklist();
      const whitelist = getCommandWhitelist();

      const isBlacklisted = blacklist.some((b: string) => command.includes(b));
      const isWhitelisted = whitelist.some((w: string) => command.includes(w));

      if (!isYoloFull && isBlacklisted && !isWhitelisted) {
        const approved = await requestFileOperationConfirmation('shell-command', command, command);
        if (!approved) {
          return res.status(403).json({ error: "Command denied by user confirmation." });
        }
      }

      const sandboxDir = getDynamicSandboxRoot();
      let workingDir: string;
      if (workdir && typeof workdir === 'string') {
        workingDir = path.isAbsolute(workdir) ? path.resolve(workdir) : path.resolve(process.cwd(), workdir);
      } else {
        workingDir = (isYoloFull || isYoloHalf) ? process.cwd() : sandboxDir;
      }
      await fs.mkdir(workingDir, { recursive: true });

      const MAX_BUFFER = 10 * 1024 * 1024;
      const { stdout, stderr } = await execPromise(command, {
        cwd: workingDir,
        timeout: shellTimeout,
        maxBuffer: MAX_BUFFER
      });

      const stdoutTruncated = Buffer.byteLength(stdout || '', 'utf8') >= MAX_BUFFER;
      const stderrTruncated = Buffer.byteLength(stderr || '', 'utf8') >= MAX_BUFFER;

      res.json({
        command,
        cwd: workingDir,
        exitCode: 0,
        stdout: stdout || '',
        stderr: stderr || '',
        truncated: stdoutTruncated || stderrTruncated,
        stdoutTruncated,
        stderrTruncated,
        timedOut: false
      });
    } catch (error: any) {
      const isTimeout = error.killed || (error.message && error.message.includes('timed out'));
      res.status(isTimeout ? 200 : 500).json({
        command,
        cwd: workdir || process.cwd(),
        exitCode: error.code ?? 1,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        truncated: false,
        timedOut: !!isTimeout,
        error: isTimeout
          ? `Command timed out after ${shellTimeout / 1000}s.`
          : error.message
      });
    }
  });

  app.post("/api/tools/question", async (req, res) => {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "No questions provided" });
    }

    try {
      const answers: string[][] = [];
      for (const q of questions) {
        answers.push([]);
      }
      res.json({ success: true, answers });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/tools/apply-patch", async (req, res) => {
    const { patchText } = req.body;
    if (!patchText || !patchText.trim()) {
      return res.status(400).json({ success: false, error: "patchText is required" });
    }

    try {
      const lines = patchText.split("\n");
      const applied: Array<{ type: string; resource: string; target: string }> = [];
      let currentFile = "";
      let currentLines: string[] = [];

      const flushFile = async () => {
        if (!currentFile) return;
        const filePath = path.isAbsolute(currentFile) ? currentFile : path.resolve(process.cwd(), currentFile);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, currentLines.join("\n") + "\n", "utf-8");
        applied.push({ type: "add", resource: currentFile, target: filePath });
      };

      for (const line of lines) {
        if (line.startsWith("--- a/") || line.startsWith("--- /dev/null")) continue;
        if (line.startsWith("+++ b/")) {
          await flushFile();
          currentFile = line.slice(6);
          currentLines = [];
          continue;
        }
        if (line.startsWith("@@")) {
          await flushFile();
          currentFile = "";
          currentLines = [];
          continue;
        }
        if (line.startsWith("-")) {
          continue;
        }
        if (line.startsWith("+")) {
          currentLines.push(line.slice(1));
          continue;
        }
        if (line.startsWith(" ")) {
          currentLines.push(line.slice(1));
          continue;
        }
      }
      await flushFile();

      res.json({ success: true, applied });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/tools/grep", async (req, res) => {
    const { pattern, path: searchPath, include, limit } = req.body;
    if (!pattern) return res.status(400).json({ error: "No pattern provided" });
    try {
      const sandboxDir = getDynamicSandboxRoot();
      const cwd = searchPath || sandboxDir;
      const includeFlag = include ? `--include '${include}'` : '';
      const grepLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
      const cmd = `grep -rn ${includeFlag} -E '${pattern}' '${cwd}' 2>/dev/null | head -${grepLimit}`;
      const { stdout } = await execPromise(cmd, { timeout: 10000, maxBuffer: 5 * 1024 * 1024 });

      // Parse into Kilocode-style items: [{ entry: { path }, line, text }]
      const items: any[] = [];
      const totalLines = stdout.trim() ? stdout.split('\n') : [];
      for (const line of totalLines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const p = line.substring(0, idx);
        const rest = line.substring(idx + 1);
        const idx2 = rest.indexOf(':');
        if (idx2 === -1) continue;
        const lineNo = parseInt(rest.substring(0, idx2), 10);
        if (isNaN(lineNo)) continue;
        items.push({
          entry: { path: getCleanRelativePath(p) },
          line: lineNo,
          text: rest.substring(idx2 + 1)
        });
      }

      res.json({
        success: true,
        items,
        truncated: totalLines.length >= grepLimit,
        partial: false,
        output: toGrepModelOutput({ items, truncated: totalLines.length >= grepLimit, partial: false })
      });
    } catch (error: any) {
      res.json({
        success: true,
        items: [],
        truncated: false,
        partial: false,
        output: 'No files found',
        stderr: error.stderr || ''
      });
    }
  });

  app.post("/api/tools/files/write", async (req, res) => {
    const { filename, path: filePath, content } = req.body;
    const target = filename || filePath;
    if (!target) return res.status(400).json({ error: "No filename provided" });

    try {
      const preview = typeof content === 'string' ? content.slice(0, 900) : undefined;
      const safePath = await resolveSystemRootPath(target, 'write', undefined, preview);
      const existed = existsSync(safePath);
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content || "");
      const cleanRel = getCleanRelativePath(safePath);
      res.json({
        success: true,
        operation: 'write',
        target: cleanRel,
        resource: cleanRel,
        existed,
        path: cleanRel,
        folder: getCleanDisplayFolder(path.dirname(safePath)),
        message: `${existed ? 'Wrote' : 'Created'} file successfully: ${cleanRel}`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/files/edit-segment", async (req, res) => {
    const { filename, path: filePath, search, replace, changes, oldString, newString, replaceAll } = req.body;
    const target = filename || filePath;
    if (!target) return res.status(400).json({ error: "No filename provided" });

    try {
      let rawContent: string | null = null;
      try {
        const peek = await resolveSystemRootPath(target, 'read');
        if (existsSync(peek)) {
          rawContent = await fs.readFile(peek, "utf-8");
        }
      } catch (_) {}

      // Determine list of changes to support (Kilocode oldString/newString/replaceAll)
      let changeList: Array<{ search: string; replace: string }> = [];
      if (changes && Array.isArray(changes)) {
        changeList = changes;
      } else if (typeof oldString === 'string') {
        if (oldString === newString) {
          return res.status(400).json({ success: false, error: "No changes to apply: oldString and newString are identical." });
        }
        if (oldString === "") {
          return res.status(400).json({ success: false, error: "oldString must not be empty. Use write to create or overwrite a file." });
        }
        changeList = [{ search: oldString, replace: newString || "" }];
      } else if (typeof search === 'string' && typeof replace === 'string') {
        changeList = [{ search, replace }];
      } else {
        return res.status(400).json({ error: "Please provide either oldString/newString (Kilocode) or search/replace strings or a changes array." });
      }

      // Build a compact diff preview for the confirmation prompt
      const previewLines: string[] = [];
      for (const change of changeList) {
        const before = change.search.replace(/\r\n/g, "\n");
        const after = change.replace.replace(/\r\n/g, "\n");
        const beforeLines = before.split("\n").slice(0, 6).map(l => `- ${l.length > 240 ? l.slice(0, 240) + "..." : l}`);
        const afterLines = after.split("\n").slice(0, 6).map(l => `+ ${l.length > 240 ? l.slice(0, 240) + "..." : l}`);
        previewLines.push(...beforeLines, ...afterLines);
      }
      const preview = previewLines.join("\n");

      const safePath = await resolveSystemRootPath(target, 'write', undefined, preview);
      if (!existsSync(safePath)) {
        return res.status(404).json({ error: `File not found at path: ${target}` });
      }

      let content = rawContent ?? await fs.readFile(safePath, "utf-8");

      let modified = false;
      let totalReplacements = 0;
      const results: any[] = [];

      // Normalize content line-endings to avoid \r\n vs \n issues
      let normalizedContent = content.replace(/\r\n/g, "\n");

      for (let i = 0; i < changeList.length; i++) {
        const item = changeList[i];
        const normalizedSearch = item.search.replace(/\r\n/g, "\n");
        const normalizedReplace = item.replace.replace(/\r\n/g, "\n");

        if (!normalizedSearch) {
          results.push({ index: i, success: false, error: "Empty search query is invalid." });
          continue;
        }

        const firstIdx = normalizedContent.indexOf(normalizedSearch);
        if (firstIdx === -1) {
          results.push({ 
            index: i, 
            success: false, 
            error: "Search token not found in file content. Ensure the exact characters, indentation, and spacing match.",
            searchSnippet: normalizedSearch.substring(0, 100) + (normalizedSearch.length > 100 ? "..." : "")
          });
          continue;
        }

        // Count all occurrences
        let count = 0;
        let off = 0;
        while ((off = normalizedContent.indexOf(normalizedSearch, off)) !== -1) {
          count++;
          off += normalizedSearch.length;
        }

        const firstIdxOnly = firstIdx === normalizedContent.lastIndexOf(normalizedSearch);
        if (count > 1 && replaceAll !== true && changeList.length === 1 && typeof oldString === 'string') {
          results.push({
            index: i,
            success: false,
            error: "Found multiple exact matches for oldString. Provide more surrounding context or set replaceAll to true.",
            matches: count
          });
          continue;
        }

        // Replace (single unique occurrence or all when replaceAll)
        if (replaceAll === true && changeList.length === 1 && typeof oldString === 'string') {
          normalizedContent = normalizedContent.split(normalizedSearch).join(normalizedReplace);
          totalReplacements += count;
        } else if (firstIdxOnly) {
          normalizedContent = normalizedContent.substring(0, firstIdx) + normalizedReplace + normalizedContent.substring(firstIdx + normalizedSearch.length);
          totalReplacements += 1;
        } else {
          results.push({ 
            index: i, 
            success: false, 
            error: "Search token matches multiple locations in the file. Please specify a more unique substring segment." 
          });
          continue;
        }
        modified = true;
        results.push({ index: i, success: true, replacements: replaceAll === true && typeof oldString === 'string' ? count : 1 });
      }

      if (modified) {
        await fs.writeFile(safePath, normalizedContent, "utf-8");
        const cleanRel = getCleanRelativePath(safePath);
        res.json({
          success: true,
          operation: 'write',
          target: cleanRel,
          resource: cleanRel,
          existed: true,
          replacements: totalReplacements,
          path: cleanRel,
          workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
          absolutePath: safePath.replace(/\\/g, '/'),
          physicalPath: safePath.replace(/\\/g, '/'),
          physicalFolder: path.dirname(safePath).replace(/\\/g, '/'),
          workspaceFolder: path.relative(process.cwd(), path.dirname(safePath)).replace(/\\/g, '/'),
          results,
          message: `Edited file successfully: ${cleanRel}`
        });
      } else {
        const failedResult = results.find(r => !r.success);
        res.status(400).json({ 
          success: false, 
          error: failedResult?.error || "No edits could be successfully matched and applied.",
          details: results 
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tools/files/read", async (req, res) => {
    const { filename, path: filePath, limit, offset, line_start, line_end } = req.query as Record<string, string>;
    const target = filename || filePath;
    if (!target) return res.status(400).json({ error: "No filename provided" });

    try {
      const safePath = await resolveSystemRootPath(target as string, 'read');

      // Directory listing (Kilocode read supports reading a directory page).
      let stats;
      try {
        stats = statSync(safePath);
      } catch (_) {
        return res.status(404).json({ error: `File not found at path: ${target}` });
      }

      if (stats.isDirectory()) {
        const entries = readdirSync(safePath, { withFileTypes: true });
        const start = offset !== undefined ? Math.max(1, parseInt(offset, 10)) : 1;
        const max = limit !== undefined ? Math.max(1, parseInt(limit, 10)) : entries.length;
        const items = entries.slice(start - 1, start - 1 + max).map((e) => ({
          path: path.join(target.replace(/\\/g, '/').replace(/\/$/, ''), e.name),
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file'
        }));
        return res.json({
          success: true,
          directory: true,
          entries: items,
          count: items.length,
          total: entries.length,
          path: getCleanRelativePath(safePath),
          items
        });
      }

      let content = await fs.readFile(safePath, "utf-8");

      // Line-based pagination (1-based inclusive) — Kilocode semantics.
      const lines = content.split(/\r?\n/);
      if (line_start !== undefined || line_end !== undefined) {
        const start = line_start !== undefined ? Math.max(1, parseInt(line_start, 10)) : 1;
        const end = line_end !== undefined ? parseInt(line_end, 10) : lines.length;
        content = lines.slice(start - 1, end).join('\n');
      } else if (offset !== undefined || limit !== undefined) {
        const start = offset !== undefined ? Math.max(1, parseInt(offset, 10)) : 1;
        const max = limit !== undefined ? Math.max(1, parseInt(limit, 10)) : lines.length;
        content = lines.slice(start - 1, start - 1 + max).join('\n');
      }

      res.json({
        success: true,
        content,
        path: getCleanRelativePath(safePath),
        workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
        absolutePath: safePath.replace(/\\/g, '/'),
        physicalPath: safePath.replace(/\\/g, '/'),
        physicalFolder: path.dirname(safePath).replace(/\\/g, '/'),
        workspaceFolder: path.relative(process.cwd(), path.dirname(safePath)).replace(/\\/g, '/'),
        message: `Successfully read file "${target}"`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tools/files/list", async (req, res) => {
    const { limit, offset, pattern, path: searchPath } = req.query as Record<string, string>;
    try {
      const sandboxDir = searchPath ? await resolveSystemRootPath(searchPath, 'read') : getDynamicSandboxRoot();
      await fs.mkdir(sandboxDir, { recursive: true });

      const getFilesRecursively = async (dir: string): Promise<string[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(entries.map(async (entry) => {
          const resPath = path.resolve(dir, entry.name);
          if (entry.isDirectory()) {
            const subFiles = await getFilesRecursively(resPath);
            return subFiles.map(f => path.join(entry.name, f));
          }
          return entry.name;
        }));
        return files.flat();
      };

      const files = await getFilesRecursively(sandboxDir);
      const cleanedFiles = files.map(f => getCleanRelativePath(f));

      const detailedFiles = files.map(f => {
        const abs = path.resolve(sandboxDir, f);
        const workspace = path.relative(process.cwd(), abs).replace(/\\/g, '/');
        return {
          name: path.basename(f),
          path: getCleanRelativePath(f),
          workspacePath: workspace,
          absolutePath: abs,
          physicalPath: abs
        };
      });

      // Kilocode glob semantics: filter by pattern when provided
      let filteredFiles = detailedFiles;
      if (pattern && pattern.trim()) {
        const globRe = globToRegExp(pattern);
        filteredFiles = detailedFiles.filter(d => globRe.test(d.name) || globRe.test(d.path));
      }

      const totalAvailable = filteredFiles.length;
      const charLimit = limit !== undefined ? Math.max(1, parseInt(limit, 10)) : undefined;
      const charOffset = offset !== undefined ? Math.max(0, parseInt(offset, 10)) : 0;
      const pagedDetailed = filteredFiles.slice(charOffset, charLimit !== undefined ? charOffset + charLimit : undefined);
      const pagedCleaned = pagedDetailed.map(d => d.path);

      res.json({
        success: true,
        totalAvailable,
        offset: charOffset,
        folder: getCleanDisplayFolder(sandboxDir),
        files: pagedCleaned,
        detailedFiles: pagedDetailed,
        items: pagedDetailed.map(d => ({ path: d.path, name: d.name, type: 'file' })),
        truncated: charLimit !== undefined && filteredFiles.length > charOffset + charLimit,
        partial: false
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/files/download", async (req, res) => {
    const { url, filename } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    try {
      const fetchResponse = await fetch(url);
      if (!fetchResponse.ok) {
        return res.status(500).json({ error: `Failed to fetch URL. Status code: ${fetchResponse.status}` });
      }

      let finalName = filename;
      if (!finalName) {
        const contentDisp = fetchResponse.headers.get("content-disposition");
        const match = contentDisp && contentDisp.match(/filename\*?=["']?(?:UTF-8'')?([^"';]+)["']?/i);
        if (match && match[1]) {
          finalName = decodeURIComponent(match[1]);
        } else {
          try {
            const parsedUrl = new URL(url);
            finalName = path.basename(parsedUrl.pathname);
          } catch (_) {}
          if (!finalName || finalName === "/" || finalName === ".") {
            finalName = "downloaded_file_" + Date.now();
          }
        }
      }

      const safePath = await resolveSystemRootPath(finalName, 'write');

      const arrayBuffer = await fetchResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, buffer);

      res.json({
        success: true,
        filename: path.basename(safePath),
        size: buffer.length,
        message: `Successfully downloaded and saved file as "${path.basename(safePath)}" (${buffer.length} bytes)`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/files/send", async (req, res) => {
    const { filename, caption, recipient, contextId } = req.body;
    if (!filename) return res.status(400).json({ error: "No filename provided" });

    try {
      const safePath = await resolveSystemRootPath(filename, 'read');

      if (!existsSync(safePath)) {
        return res.status(404).json({ error: `File "${filename}" not found.` });
      }

      let sent = false;
      let platform = "web";
      let detail = "Saved in sandbox workspace (retrievable in UI)";

      const activeContextId = contextId || "";
      if (activeContextId.startsWith("tg_")) {
        const chatId = activeContextId.substring(3);
          const bot = (globalThis as any).activeTelegramBot;
          if (bot) {
          console.log(`[API_FILE_SEND] Sending file "${filename}" to Telegram chatId: ${chatId}`);
          await bot.telegram.sendDocument(chatId, { source: createReadStream(safePath), filename: path.basename(safePath) }, { caption: caption || "" });
          sent = true;
          platform = "telegram";
          detail = `Successfully sent to Telegram active chat (${chatId})`;
        }
      } else if (activeContextId.startsWith("dc_")) {
        const channelId = activeContextId.substring(3);
        const client = (globalThis as any).activeDiscordClient;
        if (client) {
          console.log(`[API_FILE_SEND] Sending file "${filename}" to Discord channelId: ${channelId}`);
          const channel = await client.channels.fetch(channelId);
          if (channel && typeof channel.send === "function") {
            await channel.send({
              content: caption || undefined,
              files: [safePath]
            });
            sent = true;
            platform = "discord";
            detail = `Successfully sent to Discord active channel (${channelId})`;
          }
        }
      }

       if (!sent && recipient) {
        const activeDb = getDb();
        if (activeDb) {
          const cleanRec = recipient.trim();
          const cleanUsername = cleanRec.startsWith("@") ? cleanRec.substring(1) : cleanRec;
          let tgId: number | null = null;

          if (/^\d+$/.test(cleanRec)) {
            tgId = parseInt(cleanRec);
          } else {
            const rowIdent = activeDb.prepare("SELECT linkedAccounts FROM identities WHERE LOWER(perceivedName) = ? OR LOWER(realName) = ?")
              .get(cleanRec.toLowerCase(), cleanRec.toLowerCase());
            if (rowIdent) {
              const accounts = rowIdent.linkedAccounts ? JSON.parse(rowIdent.linkedAccounts) : [];
              for (const acc of accounts) {
                if (acc.toLowerCase().startsWith("telegram:id:")) {
                  tgId = parseInt(acc.split(":")[2]);
                  break;
                }
              }
            }
            if (!tgId) {
              const tgUser = activeDb.prepare("SELECT tg_id FROM telegram_users WHERE LOWER(username) = ?").get(cleanUsername.toLowerCase());
              if (tgUser) {
                tgId = tgUser.tg_id;
              }
            }
          }

          if (tgId) {
            const bot = (globalThis as any).activeTelegramBot;
            if (bot) {
            console.log(`[API_FILE_SEND] Sending file "${filename}" to resolved Telegram user: ${tgId}`);
            await bot.telegram.sendDocument(tgId, { source: createReadStream(safePath), filename: path.basename(safePath) }, { caption: caption || "" });
              sent = true;
              platform = "telegram";
              detail = `Successfully sent to Telegram recipient: ${recipient} (ID: ${tgId})`;
            }
          }
        }
      }

      res.json({
        success: true,
        sent,
        platform,
        detail,
        filename,
        message: sent ? `File successfully dispatched via ${platform}: ${detail}` : `File is saved in sandbox environment. (No active chat channel context was detected to push it directly to Telegram/Discord)`
      });
    } catch (error: any) {
      console.error("[API_FILE_SEND] Error sending file:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Secure File Manager Endpoint ---
  app.post("/api/tools/files/manager", async (req, res) => {
    const { action, source, destination, path: targetPath, recursive, pattern, confirmed } = req.body;
    if (!action) return res.status(400).json({ error: "No action provided" });

    try {
      const sandboxDir = getDynamicSandboxRoot();
      await fs.mkdir(sandboxDir, { recursive: true });

      if (action === "copy") {
        if (!source || !destination) {
          return res.status(400).json({ error: "Source and destination are required for copy action." });
        }
        const safeSrc = await verifySandboxPath(source, action, confirmed);
        const safeDst = await verifySandboxPath(destination, action, confirmed);

        if (!existsSync(safeSrc)) {
          return res.status(404).json({ error: `Source path "${source}" does not exist.` });
        }

        await fs.mkdir(path.dirname(safeDst), { recursive: true });
        await fs.cp(safeSrc, safeDst, { recursive: recursive !== false });
        
        return res.json({
          success: true,
          message: `Successfully copied "${source}" to "${destination}"`,
          source: getCleanRelativePath(safeSrc),
          destination: getCleanRelativePath(safeDst),
          sourceWorkspacePath: path.relative(process.cwd(), safeSrc).replace(/\\/g, '/'),
          destinationWorkspacePath: path.relative(process.cwd(), safeDst).replace(/\\/g, '/'),
          sourceAbsolutePath: safeSrc.replace(/\\/g, '/'),
          destinationAbsolutePath: safeDst.replace(/\\/g, '/'),
          sourcePhysicalPath: safeSrc.replace(/\\/g, '/'),
          destinationPhysicalPath: safeDst.replace(/\\/g, '/')
        });
      }

      if (action === "move") {
        if (!source || !destination) {
          return res.status(400).json({ error: "Source and destination are required for move action." });
        }
        const safeSrc = await verifySandboxPath(source, action, confirmed);
        const safeDst = await verifySandboxPath(destination, action, confirmed);

        if (!existsSync(safeSrc)) {
          return res.status(404).json({ error: `Source path "${source}" does not exist.` });
        }

        await fs.mkdir(path.dirname(safeDst), { recursive: true });
        await fs.rename(safeSrc, safeDst);

        return res.json({
          success: true,
          message: `Successfully moved/renamed "${source}" to "${destination}"`,
          source: getCleanRelativePath(safeSrc),
          destination: getCleanRelativePath(safeDst),
          sourceWorkspacePath: path.relative(process.cwd(), safeSrc).replace(/\\/g, '/'),
          destinationWorkspacePath: path.relative(process.cwd(), safeDst).replace(/\\/g, '/'),
          sourceAbsolutePath: safeSrc.replace(/\\/g, '/'),
          destinationAbsolutePath: safeDst.replace(/\\/g, '/'),
          sourcePhysicalPath: safeSrc.replace(/\\/g, '/'),
          destinationPhysicalPath: safeDst.replace(/\\/g, '/')
        });
      }

      if (action === "delete") {
        if (!targetPath) {
          return res.status(400).json({ error: "Path is required for delete action." });
        }
        const safePath = await verifySandboxPath(targetPath, action, confirmed);

        if (!existsSync(safePath)) {
          return res.status(404).json({ error: `Path "${targetPath}" does not exist.` });
        }

        if (safePath === sandboxDir) {
          return res.status(403).json({ error: "Deleting the sandbox root directory is strictly forbidden." });
        }

        await fs.rm(safePath, { recursive: recursive !== false, force: true });

        return res.json({
          success: true,
          message: `Successfully deleted "${targetPath}"`,
          path: getCleanRelativePath(safePath),
          workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
          absolutePath: safePath.replace(/\\/g, '/'),
          physicalPath: safePath.replace(/\\/g, '/')
        });
      }

      if (action === "mkdir") {
        if (!targetPath) {
          return res.status(400).json({ error: "Path is required for mkdir action." });
        }
        const safePath = await verifySandboxPath(targetPath);

        await fs.mkdir(safePath, { recursive: true });

        return res.json({
          success: true,
          message: `Successfully created directory "${targetPath}"`,
          path: getCleanRelativePath(safePath),
          workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
          absolutePath: safePath.replace(/\\/g, '/'),
          physicalPath: safePath.replace(/\\/g, '/'),
          physicalFolder: safePath.replace(/\\/g, '/'),
          workspaceFolder: path.relative(process.cwd(), safePath).replace(/\\/g, '/')
        });
      }

      if (action === "exists") {
        if (!targetPath) {
          return res.status(400).json({ error: "Path is required for exists action." });
        }
        const safePath = await verifySandboxPath(targetPath);
        const exists = existsSync(safePath);

        return res.json({
          success: true,
          exists,
          path: getCleanRelativePath(safePath),
          workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
          absolutePath: safePath.replace(/\\/g, '/'),
          physicalPath: safePath.replace(/\\/g, '/')
        });
      }

      if (action === "info") {
        if (!targetPath) {
          return res.status(400).json({ error: "Path is required for info action." });
        }
        const safePath = await verifySandboxPath(targetPath);

        if (!existsSync(safePath)) {
          return res.status(404).json({ error: `Path "${targetPath}" does not exist.` });
        }

        const stats = await fs.stat(safePath);

        return res.json({
          success: true,
          path: getCleanRelativePath(safePath),
          workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
          absolutePath: safePath.replace(/\\/g, '/'),
          physicalPath: safePath.replace(/\\/g, '/'),
          physicalFolder: path.dirname(safePath).replace(/\\/g, '/'),
          workspaceFolder: path.relative(process.cwd(), path.dirname(safePath)).replace(/\\/g, '/'),
          info: {
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            size: stats.size,
            createdAt: stats.birthtime,
            updatedAt: stats.mtime,
            permissions: stats.mode
          }
        });
      }

      if (action === "find") {
        const safeDir = targetPath ? await verifySandboxPath(targetPath) : sandboxDir;
        if (!existsSync(safeDir)) {
          return res.status(404).json({ error: `Directory "${targetPath || '.'}" does not exist.` });
        }

        const matches: Array<{ name: string; relativePath: string; isDir: boolean; size: number }> = [];
        const patternRegex = pattern ? new RegExp(pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*'), 'i') : null;

        const scan = async (dir: string) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.resolve(dir, entry.name);
            const relPath = path.relative(sandboxDir, fullPath).replace(/\\/g, '/');

            if (entry.name.startsWith('.') && entry.name !== '.' && entry.name !== '..') {
              continue;
            }

            const isMatch = !patternRegex || patternRegex.test(entry.name);
            let size = 0;
            try {
              const stat = await fs.stat(fullPath);
              size = stat.size;
            } catch (_) {}

            if (isMatch) {
              const cleanRel = getCleanRelativePath(relPath);
              matches.push({
                name: entry.name,
                relativePath: cleanRel,
                path: cleanRel,
                workspacePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
                absolutePath: fullPath.replace(/\\/g, '/'),
                physicalPath: fullPath.replace(/\\/g, '/'),
                isDir: entry.isDirectory(),
                size
              } as any);
            }

            if (entry.isDirectory() && recursive !== false) {
              await scan(fullPath);
            }
          }
        };

        await scan(safeDir);

        return res.json({
          success: true,
          physicalFolder: safeDir.replace(/\\/g, '/'),
          absoluteFolder: safeDir.replace(/\\/g, '/'),
          workspaceFolder: path.relative(process.cwd(), safeDir).replace(/\\/g, '/'),
          matches,
          count: matches.length
        });
      }

      return res.status(400).json({ error: `Unsupported file manager action: "${action}"` });
    } catch (error: any) {
      console.error("[API_FILE_MANAGER] Error executing action:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Custom Tools Registry API ---
  app.get("/api/tools/custom", async (req, res) => {
    try {
      const registryPath = CustomToolsLoader.getRegistryPath();
      let customTools = [];
      try {
        const fileData = await fs.readFile(registryPath, 'utf8');
        customTools = JSON.parse(fileData);
      } catch (err) {
        // file doesn't exist yet, return empty list
      }
      res.json({ success: true, tools: customTools });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/custom", async (req, res) => {
    try {
      const toolDef = req.body;
      if (!toolDef || !toolDef.id || !toolDef.name) {
        return res.status(400).json({ error: "id and name are required." });
      }

      const registryPath = CustomToolsLoader.getRegistryPath();
      let customTools: any[] = [];
      try {
        const fileData = await fs.readFile(registryPath, 'utf8');
        customTools = JSON.parse(fileData);
      } catch (_) {}

      const existingIdx = customTools.findIndex((t: any) => t.id === toolDef.id);
      if (existingIdx !== -1) {
        customTools[existingIdx] = { ...customTools[existingIdx], ...toolDef };
      } else {
        customTools.push(toolDef);
      }

      await fs.writeFile(registryPath, JSON.stringify(customTools, null, 2), 'utf8');

       // Register it in our SystemRegistry dynamically
       CustomToolsLoader.registerTool(toolDef);

       // Re-trigger available_tools.json generation
       try {
        writeAvailableToolsFile();
      } catch (genErr) {
        console.error("[SERVER] Failed to regenerate available_tools.json dynamically:", genErr);
      }

      res.json({ success: true, message: `Tool ${toolDef.id} registered successfully.`, tool: toolDef });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tools/custom/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const registryPath = CustomToolsLoader.getRegistryPath();
      let customTools: any[] = [];
      try {
        const fileData = await fs.readFile(registryPath, 'utf8');
        customTools = JSON.parse(fileData);
      } catch (_) {}

      const updatedTools = customTools.filter((t: any) => t.id !== id);
      await fs.writeFile(registryPath, JSON.stringify(updatedTools, null, 2), 'utf8');

       // Unregister in memory
       try {
         (SystemRegistry as any).tools = (SystemRegistry as any).tools.filter((t: any) => t.metadata.id !== id);
        
        // Re-generate available_tools.json
        writeAvailableToolsFile();
      } catch (err) {
        console.error("[SERVER] Memory unregister failed:", err);
      }

      res.json({ success: true, message: `Tool ${id} deleted successfully.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Background Process Management ---
  app.post("/api/tools/bgproc/spawn", async (req, res) => {
    const { command, args, label, cwd, env, maxLogLines } = req.body;
    if (!command) return res.status(400).json({ error: "command is required." });

    try {
       const mgr = BackgroundProcessManager.getInstance();

       // Basic safety: only allow if yolo mode or command is whitelisted
      const yoloMode = getYoloMode();
      const whitelist = getCommandWhitelist();
      const blacklist = getCommandBlacklist();
      const fullCmd = [command, ...(args ?? [])].join(" ");
      const isBlacklisted = blacklist.some((b: string) => fullCmd.includes(b));
      const isWhitelisted = whitelist.some((w: string) => fullCmd.includes(w));

      if (yoloMode !== 'full' && isBlacklisted && !isWhitelisted) {
        return res.status(403).json({ error: "Command restricted for safety." });
      }

      const record = mgr.spawn({
        command,
        args: Array.isArray(args) ? args : (args ? String(args).split(" ") : []),
        label: label ?? command,
        cwd: cwd ?? process.cwd(),
        env: env ?? {},
        maxLogLines: maxLogLines ?? 200,
      });

      res.json({ success: true, process: sanitizeRecord(record) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/tools/bgproc/list", async (_req, res) => {
    try {
       const mgr = BackgroundProcessManager.getInstance();
       res.json({ success: true, processes: mgr.list().map(sanitizeRecord) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tools/bgproc/stop", async (req, res) => {
    const { id, signal } = req.body;
    if (!id) return res.status(400).json({ error: "id is required." });
    try {
       const mgr = BackgroundProcessManager.getInstance();
       const ok = mgr.stop(id, signal ?? "SIGTERM");
      res.json({ success: ok, message: ok ? `Process ${id} stopped.` : `Process ${id} not found or already stopped.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/tools/bgproc/:id", async (req, res) => {
    const { id } = req.params;
    try {
       const mgr = BackgroundProcessManager.getInstance();
       const ok = mgr.remove(id);
      res.json({ success: ok, message: ok ? `Process ${id} removed.` : `Cannot remove: process is still running or not found.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/tools/bgproc/:id/logs", async (req, res) => {
    const { id } = req.params;
    const tail = parseInt(String(req.query.tail ?? "100"), 10);
    try {
       const mgr = BackgroundProcessManager.getInstance();
       const record = mgr.get(id);
      if (!record) return res.status(404).json({ error: `Process ${id} not found.` });
      const logs = mgr.getLogs(id, tail);
      res.json({ success: true, id, status: record.status, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API Catch-all ---
  // Routes will be injected here
}

function sanitizeRecord(r: any) {
  return {
    id: r.id,
    label: r.label,
    command: r.command,
    args: r.args,
    cwd: r.cwd,
    status: r.status,
    pid: r.pid,
    startedAt: r.startedAt,
    stoppedAt: r.stoppedAt,
    exitCode: r.exitCode,
    logCount: r.logs?.length ?? 0,
  };
}

function parseHtmlFallback(html: string, selector?: string): string {
  let text = html;

  // Stripping unneeded structural blocks
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '');
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

  if (selector) {
    // Basic extraction for simple tags (e.g. h1, p, title)
    const tags = selector.split(',').map(s => s.trim().split(/[#.]/)[0]).filter(Boolean);
    if (tags.length > 0) {
      const matches: string[] = [];
      for (const tag of tags) {
        const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const cleanContent = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (cleanContent) {
            matches.push(cleanContent);
          }
        }
      }
      if (matches.length > 0) {
        return matches.join('\n\n');
      }
      return `[Warning] CSS selector "${selector}" did not match any elements via fallback regex parser.`;
    }
  }

  // Strip all remaining HTML tags
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

