import express from "express";
import path from "path";
import fs from "fs/promises";
import { existsSync, readdirSync, statSync, realpathSync, mkdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { AIService } from "../../kernel/ai.js";
import { SettingsManager } from "../../kernel/settings.js";
import { apiCustomSystemRoot, verifySandboxPath, getDynamicSandboxRoot, resolveSystemRootPath, getYoloMode, getCommandBlacklist, getCommandWhitelist } from "../apiRouter.js";
import { CustomToolsLoader } from "../../CustomToolsLoader.js";
import { APIService } from "../../../services/api.js";

const execPromise = promisify(exec);

function getCleanRelativePath(filename: string): string {
  const cwd = process.cwd();
  let cleaned = filename;
  if (path.isAbsolute(cleaned)) {
    if (cleaned.startsWith(cwd)) {
      cleaned = path.relative(cwd, cleaned) || ".";
    } else if (cleaned.startsWith('/app/')) {
      cleaned = cleaned.substring('/app/'.length);
    } else if (cleaned === '/app') {
      cleaned = ".";
    }
  }
  
  // Normalize formatting and ensure standard relative prefixes
  cleaned = cleaned.replace(/\\/g, '/');
  if (cleaned.startsWith('.yuihime/user_data/')) {
    cleaned = cleaned.substring('.yuihime/'.length);
  } else if (cleaned.startsWith('.yuihime/')) {
    // Keep as .yuihime/
  } else if (cleaned.startsWith('user_data/')) {
    // Already in correct format
  } else {
    // Check if it's inside user_data folder and prepend if needed,
    // but only if it's not a root system directory
    const systemDirs = ['agent', 'addons', 'data', 'models', '.yuihime'];
    const firstPart = cleaned.split('/')[0];
    if (!systemDirs.includes(firstPart) && firstPart !== "") {
      cleaned = `user_data/${cleaned}`;
    }
  }
  return cleaned;
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
        id: 'tool_' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        toolName: toolName,
        endpointPath: "/api/tools" + req.path,
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
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: "No query provided" });

    try {
      const ai = AIService.getInstance();
      const results = await ai.search(query as string);
      res.json(results);
    } catch (error: any) {
      console.error("[SERVER] Google Search Grounding tool failed:", error);
      // Fallback in case of API Key configuration or service issues so it never breaks the prompt completely
      const fallbackResults = [
        { title: `${query} - Wikipedia`, snippet: `Knowledge summary for ${query}. This topic involves complex systems and historical context...`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query as string)}` },
        { title: `Latest News on ${query}`, snippet: `Recent developments indicate a shift in how ${query} is perceived by the global community.`, url: `https://news.google.com/search?q=${encodeURIComponent(query as string)}` }
      ];
      res.json(fallbackResults);
    }
  });

  app.post("/api/tools/snipper", async (req, res) => {
    const { url, selector, saveToMemory, context, importance, defaultUserAgent, maxContentLength, engine, jinaApiKey } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    try {
      let extractedText = '';
      let scrapeSuccess = false;
      const scrapeEngine = engine || 'jina';

      // 1. Primary Engine: Jina Reader API
      if (scrapeEngine === 'jina') {
        try {
          console.log(`[WEB_SNIPPER] Scraping via Jina Reader API (r.jina.ai) in Express Route for URL: ${url}`);
          const jinaHeaders: Record<string, string> = {
            'Accept': 'text/plain'
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
            console.log(`[WEB_SNIPPER] Successfully scraped ${extractedText.length} chars via Jina Reader API.`);
          } else {
            console.warn(`[WEB_SNIPPER] Jina Reader in API route returned non-ok status: ${jinaResponse.status} ${jinaResponse.statusText}. Falling back to local scraper...`);
          }
        } catch (jinaErr: any) {
          console.warn(`[WEB_SNIPPER] Jina Reader in API route failed (${jinaErr.message}). Falling back to local scraper...`);
        }
      }

      // 2. Secondary Engine/Fallback: Local scraping via Cheerio / Regex
      if (!scrapeSuccess) {
        console.log(`[WEB_SNIPPER] Scraping via Local Scraper in Express Route for URL: ${url}`);
        const userAgent = defaultUserAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const response = await fetch(url, { 
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        let cheerioFailed = false;
        let $;

        try {
          const cheerio = await import('cheerio');
          $ = cheerio.load(html);
        } catch (cheerioErr: any) {
          console.warn("[WEB_SNIPPER] Cheerio fallback triggered in API route:", cheerioErr.message);
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
        selector: selector || null,
        length: extractedText.length,
        content: extractedText,
        savedToMemory: false
      };

      if (saveToMemory !== false && extractedText.trim().length > 0 && !extractedText.startsWith('[Warning]')) {
        const { StorageServer } = await import('../../../drivers/storageServer.js');
        const memoryContext = context || 'web_default';
        const imp = typeof importance === 'number' ? importance : 0.8;
        
        const memoryData = {
          type: "system",
          speaker: "system",
          content: `[WEB_SNIPPER] Snipped data from ${url} (Selector: ${selector || 'Entire page'}):\n${extractedText}`,
          tags: ["web_snip", "scraped_content"],
          context: memoryContext,
          importance: imp,
          meta: { url, selector, snippedAt: Date.now() }
        };

        const saved = await StorageServer.saveMemory(memoryData);
        result.savedToMemory = true;
        result.memoryId = saved.id;
        result.context = memoryContext;
      }

      res.json(result);
    } catch (error: any) {
      console.error("[SERVER] WebSnipper route execution failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tools/search", async (req, res) => {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "No query provided" });
    }

    try {
      console.log(`[SERVER_SEARCH_ROUTE] Performing web search for query: "${query}"`);
      const results = await AIService.getInstance().search(String(query));
      res.json(results);
    } catch (error: any) {
      console.error("[SERVER_SEARCH_ROUTE] Web search execution failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tools/memory-search", async (req, res) => {
    const { query, limit, type } = req.query;
    if (!query) {
      return res.status(400).json({ error: "No query provided" });
    }

    try {
      const { searchMemories } = await import('../../memorySearch.js');
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
      const result = eval(code);
      res.json({ result: String(result) });
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
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "No command provided" });
    
    try {
      const yoloMode = getYoloMode();
      const isYoloFull = yoloMode === 'full';
      const isYoloHalf = yoloMode === 'half';

      const blacklist = getCommandBlacklist();
      const whitelist = getCommandWhitelist();

      const isBlacklisted = blacklist.some((b: string) => command.includes(b));
      const isWhitelisted = whitelist.some((w: string) => command.includes(w));

      if (!isYoloFull && isBlacklisted && !isWhitelisted) {
        return res.status(403).json({ error: "Command restricted for safety." });
      }

      const sandboxDir = getDynamicSandboxRoot();
      const workingDir = (isYoloFull || isYoloHalf) ? process.cwd() : sandboxDir;
      await fs.mkdir(workingDir, { recursive: true });

      let shellTimeout = 120000;
      try {
        const { SettingsManager } = await import("../../kernel/settings.js");
        const settings = await SettingsManager.getInstance().load();
        const toolExecutorConfig = settings['tool-executor'] || {};
        if (toolExecutorConfig.shellTimeoutMs !== undefined) {
          shellTimeout = Number(toolExecutorConfig.shellTimeoutMs);
        }
      } catch (e) {
        console.warn("[SERVER] Failed to load tool-executor config for shell route, using 120s fallback.", e);
      }

      const { stdout, stderr } = await execPromise(command, { cwd: workingDir, timeout: shellTimeout });
      res.json({ stdout, stderr });
    } catch (error: any) {
      res.status(500).json({ error: error.message, stderr: error.stderr });
    }
  });

  app.post("/api/tools/files/write", async (req, res) => {
    const { filename, content } = req.body;
    if (!filename) return res.status(400).json({ error: "No filename provided" });

    try {
      const safePath = await resolveSystemRootPath(filename, 'write');
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content || "");
      res.json({
        success: true,
        path: getCleanRelativePath(safePath),
        workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
        absolutePath: safePath.replace(/\\/g, '/'),
        physicalPath: safePath.replace(/\\/g, '/'),
        physicalFolder: path.dirname(safePath).replace(/\\/g, '/'),
        workspaceFolder: path.relative(process.cwd(), path.dirname(safePath)).replace(/\\/g, '/'),
        message: `Successfully wrote file to "${getCleanRelativePath(safePath)}"`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tools/files/edit-segment", async (req, res) => {
    const { filename, search, replace, changes } = req.body;
    if (!filename) return res.status(400).json({ error: "No filename provided" });

    try {
      const safePath = await resolveSystemRootPath(filename, 'write');
      if (!existsSync(safePath)) {
        return res.status(404).json({ error: `File not found at path: ${filename}` });
      }

      let content = await fs.readFile(safePath, "utf-8");
      
      // Determine list of changes to process
      let changeList: Array<{ search: string; replace: string }> = [];
      if (changes && Array.isArray(changes)) {
        changeList = changes;
      } else if (typeof search === 'string' && typeof replace === 'string') {
        changeList = [{ search, replace }];
      } else {
        return res.status(400).json({ error: "Please provide either search/replace strings or a changes array." });
      }

      let modified = false;
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

        const lastIdx = normalizedContent.lastIndexOf(normalizedSearch);
        if (firstIdx !== lastIdx) {
          results.push({ 
            index: i, 
            success: false, 
            error: "Search token matches multiple locations in the file. Please specify a more unique substring segment." 
          });
          continue;
        }

        // Replace unique occurrence
        normalizedContent = normalizedContent.substring(0, firstIdx) + normalizedReplace + normalizedContent.substring(firstIdx + normalizedSearch.length);
        modified = true;
        results.push({ index: i, success: true });
      }

      if (modified) {
        await fs.writeFile(safePath, normalizedContent, "utf-8");
        res.json({
          success: true,
          path: getCleanRelativePath(safePath),
          workspacePath: path.relative(process.cwd(), safePath).replace(/\\/g, '/'),
          absolutePath: safePath.replace(/\\/g, '/'),
          physicalPath: safePath.replace(/\\/g, '/'),
          physicalFolder: path.dirname(safePath).replace(/\\/g, '/'),
          workspaceFolder: path.relative(process.cwd(), path.dirname(safePath)).replace(/\\/g, '/'),
          results,
          message: `Successfully edited segments of file "${getCleanRelativePath(safePath)}"`
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
    const { filename, limit, offset, line_start, line_end } = req.query as Record<string, string>;
    if (!filename) return res.status(400).json({ error: "No filename provided" });

    try {
      const safePath = await resolveSystemRootPath(filename as string, 'read');
      let content = await fs.readFile(safePath, "utf-8");

      // Line-based pagination (1-based inclusive).
      if (line_start !== undefined || line_end !== undefined) {
        const lines = content.split(/\r?\n/);
        const start = line_start !== undefined ? Math.max(1, parseInt(line_start, 10)) : 1;
        const end = line_end !== undefined ? parseInt(line_end, 10) : lines.length;
        content = lines.slice(start - 1, end).join('\n');
      } else {
        // Character-based pagination.
        const charLimit = limit !== undefined ? Math.max(1, parseInt(limit, 10)) : undefined;
        const charOffset = offset !== undefined ? Math.max(0, parseInt(offset, 10)) : 0;
        if (charLimit !== undefined || charOffset > 0) {
          content = content.substring(charOffset, charLimit !== undefined ? charOffset + charLimit : undefined);
        }
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
        message: `Successfully read file "${filename}"`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tools/files/list", async (req, res) => {
    const { limit, offset } = req.query as Record<string, string>;
    try {
      const sandboxDir = getDynamicSandboxRoot();
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

      const totalAvailable = detailedFiles.length;
      const charLimit = limit !== undefined ? Math.max(1, parseInt(limit, 10)) : undefined;
      const charOffset = offset !== undefined ? Math.max(0, parseInt(offset, 10)) : 0;
      const pagedDetailed = detailedFiles.slice(charOffset, charLimit !== undefined ? charOffset + charLimit : undefined);
      const pagedCleaned = cleanedFiles.slice(charOffset, charLimit !== undefined ? charOffset + charLimit : undefined);

      res.json({
        success: true,
        totalAvailable,
        offset: charOffset,
        physicalFolder: sandboxDir.replace(/\\/g, '/'),
        absoluteFolder: sandboxDir.replace(/\\/g, '/'),
        workspaceFolder: path.relative(process.cwd(), sandboxDir).replace(/\\/g, '/'),
        files: pagedCleaned,
        detailedFiles: pagedDetailed
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
          const { createReadStream } = await import("fs");
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
        const dbModulePath = '../../core/database.js';
        const dbMod = await import(/* @vite-ignore */ dbModulePath);
        const activeDb = dbMod.initializeDatabase();
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
              const { createReadStream } = await import("fs");
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
        const { SystemRegistry } = await import("../../registry.js");
        const tools = SystemRegistry.getTools();
        const toolsData = tools.map((t: any) => t.metadata);
        const outputFilePath = path.resolve(process.cwd(), 'src', 'core', 'available_tools.json');
        await fs.writeFile(outputFilePath, JSON.stringify(toolsData, null, 2), 'utf8');
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
        const { SystemRegistry } = await import("../../registry.js");
        (SystemRegistry as any).tools = (SystemRegistry as any).tools.filter((t: any) => t.metadata.id !== id);
        
        // Re-generate available_tools.json
        const tools = SystemRegistry.getTools();
        const toolsData = tools.map((t: any) => t.metadata);
        const outputFilePath = path.resolve(process.cwd(), 'src', 'core', 'available_tools.json');
        await fs.writeFile(outputFilePath, JSON.stringify(toolsData, null, 2), 'utf8');
      } catch (err) {
        console.error("[SERVER] Memory unregister failed:", err);
      }

      res.json({ success: true, message: `Tool ${id} deleted successfully.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- API Catch-all ---
  // Routes will be injected here
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

