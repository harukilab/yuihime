import express from "express";
import path from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync, renameSync, statSync, readdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as toml from "smol-toml";
import { AIService } from "../../kernel/ai.js";
import { SettingsManager } from "../../kernel/settings.js";
import { verifySandboxPath, SANDBOX_ROOT, sandboxCfg, systemConfig, getDynamicSandboxRoot, getYoloMode, getCommandBlacklist, getCommandWhitelist } from "../apiRouter.js";

const execPromise = promisify(exec);

export function registerSandboxRoutes(app: express.Express, db: any) {
  app.get("/api/config", (req, res) => {
    res.json(systemConfig);
  });

  app.get("/api/sandbox/pending-confirmations", (req, res) => {
    const list = (globalThis.pendingConfirmations || []).filter(item => item.status === 'pending');
    res.json({ list });
  });

  app.post("/api/sandbox/pending-confirmations/:id/action", (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'always' | 'denied'
    const list = globalThis.pendingConfirmations || [];
    const item = list.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({ error: "Pending confirmation not found." });
    }
    item.status = status;
    res.json({ success: true, item });
  });

  app.post("/api/sandbox/pending-confirmations/batch/action", (req, res) => {
    const { ids, status } = req.body; // ids: string[] or undefined (undefined means all pending), status: 'approved' | 'denied'
    const list = globalThis.pendingConfirmations || [];
    const updatedItems: any[] = [];
    
    for (const item of list) {
      if (item.status === 'pending') {
        if (!ids || ids.includes(item.id)) {
          item.status = status;
          updatedItems.push(item);
        }
      }
    }
    res.json({ success: true, count: updatedItems.length, items: updatedItems });
  });

  app.post("/api/sandbox/file", async (req, res) => {
    try {
      const { name, content, action, confirmed } = req.body;
      const fullPath = await verifySandboxPath(name || ".", action, confirmed);
      
      if (action === 'write') {
        const dir = path.dirname(fullPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content || "");
        return res.json({ success: true, message: `File ${name} saved to sandbox.` });
      } else if (action === 'read') {
        if (!existsSync(fullPath)) return res.status(404).json({ error: "File not found." });
        const data = readFileSync(fullPath, 'utf-8');
        return res.json({ content: data });
      } else if (action === 'list') {
        const dynamicSandboxRoot = getDynamicSandboxRoot();
        const target = existsSync(fullPath) ? fullPath : dynamicSandboxRoot;
        const files = readdirSync(target, { withFileTypes: true }).map(f => ({
          name: f.name,
          isDir: f.isDirectory(),
          size: f.isDirectory() ? 0 : statSync(path.join(target, f.name)).size
        }));
        return res.json({ files });
      } else if (action === 'delete') {
        if (existsSync(fullPath)) {
          const stats = statSync(fullPath);
          if (stats.isDirectory()) {
            rmSync(fullPath, { recursive: true, force: true });
          } else {
            unlinkSync(fullPath);
          }
          return res.json({ success: true });
        }
        return res.status(404).json({ error: "Not found." });
      }
      res.status(400).json({ error: "Invalid action" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sandbox/exec", (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "No command provided" });
    
    const yoloMode = getYoloMode();
    const isYoloFull = yoloMode === 'full';
    const isYoloHalf = yoloMode === 'half';

    const blacklist = getCommandBlacklist();
    const whitelist = getCommandWhitelist();

    const isBlacklisted = blacklist.some((b: string) => command.includes(b));
    const isWhitelisted = whitelist.some((w: string) => command.includes(w));

    if (!isYoloFull && isBlacklisted && !isWhitelisted) {
       return res.status(403).json({ error: "Command blocked by security sandbox." });
    }

    const dynamicSandboxRoot = getDynamicSandboxRoot();
    const workingDir = (isYoloFull || isYoloHalf) ? process.cwd() : dynamicSandboxRoot;
    exec(command, { cwd: workingDir, timeout: sandboxCfg.execTimeoutMs }, (error: any, stdout: string, stderr: string) => {
      res.json({
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: error ? error.code : 0,
        success: !error
      });
    });
  });

  // --- Automatic File Manipulation API ---
  app.post("/api/sandbox/file-manipulate", async (req, res) => {
    try {
      const { action, target, files, archiveName, sortBy, targetFormat, options } = req.body;
      
      if (action === 'sort') {
        const targetPath = await verifySandboxPath(target || ".");
        const dirEntries = readdirSync(targetPath, { withFileTypes: true });
        const movedFiles: string[] = [];

        if (sortBy === 'type') {
          const categories = {
            documents: ['.txt', '.md', '.pdf', '.docx', '.csv', '.xlsx', '.toml', '.json'],
            images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.ico'],
            code: ['.js', '.ts', '.py', '.sh', '.html', '.css', '.cpp', '.java', '.go'],
            archives: ['.zip', '.tar', '.gz', '.rar', '.7z']
          };

          for (const entry of dirEntries) {
            if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              let targetDirName = "others";

              for (const [category, extensions] of Object.entries(categories)) {
                if (extensions.includes(ext)) {
                  if (entry.name === 'system.config.json' || entry.name === 'package.json' || entry.name === 'config.toml') {
                    continue;
                  }
                  targetDirName = category;
                  break;
                }
              }

              const categoryDir = path.join(targetPath, targetDirName);
              if (!existsSync(categoryDir)) {
                mkdirSync(categoryDir, { recursive: true });
              }

              const srcFilePath = path.join(targetPath, entry.name);
              const destFilePath = path.join(categoryDir, entry.name);
              renameSync(srcFilePath, destFilePath);
              movedFiles.push(`${entry.name} -> ${targetDirName}/${entry.name}`);
            }
          }
          return res.json({ success: true, message: `Successfully sorted files by extension.`, details: movedFiles });
        } else {
          let sorted = dirEntries
            .filter(f => f.isFile())
            .map(f => {
              const full = path.join(targetPath, f.name);
              const stat = statSync(full);
              return { name: f.name, size: stat.size, mtime: stat.mtimeMs };
            });

          if (sortBy === 'size') {
            sorted.sort((a, b) => b.size - a.size);
          } else if (sortBy === 'date') {
            sorted.sort((a, b) => b.mtime - a.mtime);
          } else {
            sorted.sort((a, b) => a.name.localeCompare(b.name));
          }

          return res.json({ success: true, files: sorted });
        }
      } 
      
      else if (action === 'archive') {
        if (!archiveName) {
          return res.status(400).json({ error: "archiveName is required for archiving." });
        }
        if (!files || !Array.isArray(files) || files.length === 0) {
          return res.status(400).json({ error: "files list is required for archiving." });
        }

        const safeArchiveName = path.basename(archiveName).endsWith('.zip') ? archiveName : `${archiveName}.zip`;
        const archivePath = await verifySandboxPath(safeArchiveName);
        
        const escapedFiles = (await Promise.all(files.map(async f => {
          const verified = await verifySandboxPath(f);
          return path.relative(SANDBOX_ROOT, verified);
        }))).map(p => `"${p}"`).join(" ");

        console.log(`[FILE_MODULE] Archiving files: ${escapedFiles} into ${safeArchiveName}`);
        
        const command = `zip -r "${safeArchiveName}" ${escapedFiles}`;
        
        exec(command, { cwd: SANDBOX_ROOT, timeout: 15000 }, (error: any, stdout: string, stderr: string) => {
          if (error) {
            const tarCommand = `tar -czf "${safeArchiveName.replace('.zip', '.tar.gz')}" ${escapedFiles}`;
            exec(tarCommand, { cwd: SANDBOX_ROOT, timeout: 15000 }, (tarError: any, tarStdout: string, tarStderr: string) => {
              if (tarError) {
                return res.status(500).json({ 
                  error: "Failed to archive files.", 
                  details: error.message + " | " + tarError.message 
                });
              }
              return res.json({ 
                success: true, 
                message: `Created compressed tarball: ${safeArchiveName.replace('.zip', '.tar.gz')}`,
                stdout: tarStdout
              });
            });
          } else {
            return res.json({ 
              success: true, 
              message: `Successfully archived files into zip: ${safeArchiveName}`,
              stdout 
            });
          }
        });
        return;
      } 
      
      else if (action === 'summarize') {
        if (!target) return res.status(400).json({ error: "target file is required for summary." });
        const filePath = await verifySandboxPath(target);
        if (!existsSync(filePath)) return res.status(404).json({ error: "Target file does not exist." });

        const rawContent = readFileSync(filePath, 'utf-8');
        const contentLimit = rawContent.slice(0, 15000); 

        const ai = AIService.getInstance();
        const customPrompt = options?.summaryPrompt || "Generate a dense, informative, and structurally elegant cognitive summary of the following document:";
        const promptTemplate = `${customPrompt}\n\n=== DOCUMENT ===\n${contentLimit}\n=== END OF DOCUMENT ===\n\nProvide a clean summary showcasing the key points at a professional standard.`;
        
        const { SystemRegistry } = await import('../../registry.js');
        const settings = SettingsManager.getInstance();
        const activeProvider = settings.get('provider') || '';
        if (!activeProvider) {
          return res.status(400).json({ error: "No active AI Provider is configured. Please choose one in Settings -> Consciousness." });
        }
        const providerSettings = settings.get(activeProvider) || {};
        const chosenModel = providerSettings.model || providerSettings.modelId || '';

        const providerModule = SystemRegistry.getProvider(activeProvider);
        let summaryText = "";
        const systemInstruction = "You are Yuihime's automated file cognition and indexing clerk. Present a clean, concise, and highly objective summary of the provided text.";

        if (providerModule && typeof providerModule.generate === 'function') {
          summaryText = await providerModule.generate(promptTemplate, {
            config: providerSettings,
            assembledSystemPrompt: systemInstruction,
            model: chosenModel
          });
        } else {
          summaryText = await ai.generate(promptTemplate, {
            model: chosenModel,
            systemInstruction: systemInstruction
          });
        }

        return res.json({ success: true, summary: summaryText, target, size: statSync(filePath).size });
      } 
      
      else if (action === 'convert') {
        if (!target) return res.status(400).json({ error: "target file path is required." });
        if (!targetFormat) return res.status(400).json({ error: "targetFormat is required." });

        const filePath = await verifySandboxPath(target);
        if (!existsSync(filePath)) return res.status(404).json({ error: "Source file does not exist." });
        const currentExt = path.extname(filePath).toLowerCase();

        const rawContent = readFileSync(filePath, 'utf-8');
        let convertedContent = "";
        let newFileName = "";

        if (currentExt === '.csv' && targetFormat === 'json') {
          const lines = rawContent.split(/\r?\n/).filter(line => line.trim() !== "");
          if (lines.length > 0) {
            const headers = lines[0].split(',').map(h => h.trim());
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
              const currentline = lines[i].split(',');
              if (currentline.length === headers.length) {
                const obj: any = {};
                for (let j = 0; j < headers.length; j++) {
                  obj[headers[j]] = currentline[j].trim();
                }
                rows.push(obj);
              }
            }
            convertedContent = JSON.stringify(rows, null, 2);
            newFileName = target.replace(/\.csv$/i, '.json');
          } else {
            return res.status(400).json({ error: "CSV file is empty." });
          }
        } 
        
        else if (currentExt === '.json' && targetFormat === 'toml') {
          try {
            const jsonParsed = JSON.parse(rawContent);
            convertedContent = toml.stringify(jsonParsed);
            newFileName = target.replace(/\.json$/i, '.toml');
          } catch (e: any) {
            return res.status(400).json({ error: `Failed to parse JSON: ${e.message}` });
          }
        } 
        
        else if (currentExt === '.toml' && targetFormat === 'json') {
          try {
            const tomlParsed = toml.parse(rawContent);
            convertedContent = JSON.stringify(tomlParsed, null, 2);
            newFileName = target.replace(/\.toml$/i, '.json');
          } catch (e: any) {
            return res.status(400).json({ error: `Failed to parse TOML: ${e.message}` });
          }
        } 
        
        else if (targetFormat === 'markdown' || targetFormat === 'md') {
          convertedContent = `# MD Document: ${path.basename(target)}\n\n${rawContent}`;
          newFileName = target.replace(new RegExp(`${currentExt}$`, 'i'), '.md');
        } 
        
        else {
          return res.status(400).json({ 
            error: `Conversion from ${currentExt} to ${targetFormat} is not supported directly. Supported: csv->json, json->toml, toml->json, txt->md.` 
          });
        }

        const newFilePath = await verifySandboxPath(newFileName);
        writeFileSync(newFilePath, convertedContent, 'utf-8');

        return res.json({ 
          success: true, 
          message: `Converted file saved as: ${newFileName}`,
          newFileName,
          size: convertedContent.length
        });
      }

      res.status(400).json({ error: "Invalid action." });
    } catch (e: any) {
      console.error("[SERVER] File manipulation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- File Automation Endpoints ---
  app.get("/api/file-automation/rules", (req, res) => {
    try {
      const row = db.prepare("SELECT value FROM custom_storage WHERE key = 'yuihime_file_automation_rules'").get() as any;
      const rules = row ? JSON.parse(row.value) : [];
      res.json(rules);
    } catch (e: any) {
      console.error("[SERVER] GET File Automation Rules error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/file-automation/rules", async (req, res) => {
    try {
      const rules = req.body;
      db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES ('yuihime_file_automation_rules', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(JSON.stringify(rules), Date.now());

      // Sync rules with Cron modules
      const { syncFileAutomationRulesAndSchedules } = await import("../fileAutomation.js");
      syncFileAutomationRulesAndSchedules(db);

      res.json({ success: true });
    } catch (e: any) {
      console.error("[SERVER] POST File Automation Rules error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/file-automation/run/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const row = db.prepare("SELECT value FROM custom_storage WHERE key = 'yuihime_file_automation_rules'").get() as any;
      const rules = row ? JSON.parse(row.value) : [];
      const rule = rules.find((r: any) => r.id === id);
      
      if (!rule) {
        return res.status(404).json({ error: "Rule not found." });
      }

      const { executeFileAutomationRuleInternal } = await import("../fileAutomation.js");
      const log = await executeFileAutomationRuleInternal(db, rule);
      
      res.json({ success: true, log });
    } catch (e: any) {
      console.error("[SERVER] Run File Automation Rule error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/file-automation/suggest", async (req, res) => {
    try {
      const { suggestFileAutomationRulesHeuristic } = await import("../fileAutomation.js");
      const suggestions = suggestFileAutomationRulesHeuristic();
      res.json(suggestions);
    } catch (e: any) {
      console.error("[SERVER] GET Suggestions error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/file-automation/logs", (req, res) => {
    try {
      const row = db.prepare("SELECT value FROM custom_storage WHERE key = 'yuihime_file_automation_history'").get() as any;
      const logs = row ? JSON.parse(row.value) : [];
      res.json(logs);
    } catch (e: any) {
      console.error("[SERVER] GET File Automation Logs error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/file-automation/logs/clear", (req, res) => {
    try {
      db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES ('yuihime_file_automation_history', '[]', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(Date.now());
      res.json({ success: true });
    } catch (e: any) {
      console.error("[SERVER] Clear Logs error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- Identity APIs ---
  // Routes will be injected here
}
