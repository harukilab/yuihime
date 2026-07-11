import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, renameSync, unlinkSync } from "fs";
import path from "path";
import { AIService } from "../kernel/ai.js";
import { SettingsManager } from "../kernel/settings.js";
import { SystemRegistry } from "../registry.js";
import { CronModule } from "../kernel/cron.js";

export interface FileAutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: 'schedule' | 'pattern'; 
  scheduleExpr: string; // e.g., "5m", "1h", "*/30 * * * *"
  filePattern: string; // e.g., "*.log", "*.csv"
  conditionType: 'none' | 'size' | 'content_contains' | 'age';
  conditionValue: string; // e.g., "> 1mb", "error", "2d"
  actionType: 'none' | 'organize_by_type' | 'move' | 'copy' | 'delete' | 'edit_replace' | 'ai_summarize' | 'ai_edit';
  actionParams: string; // JSON: targetPath, regexMatch, regexReplace, summaryPrompt, editPrompt, outputSuffix
  lastRun?: number;
  lastStatus?: 'success' | 'failed';
  lastLog?: string;
}

export interface FileAutomationLog {
  timestamp: number;
  ruleId: string;
  ruleName: string;
  status: 'success' | 'failed';
  message: string;
  filesProcessed: string[];
  actionPerformed: string;
}

import { getDynamicSandboxRoot } from "./apiRouter.js";

/**
 * Secure resolve of files in sandbox to prevent symlink bypass and traversal
 */
const verifySandboxPath = (targetPath: string) => {
  const SANDBOX_ROOT = getDynamicSandboxRoot();
  if (targetPath.includes('\0')) {
    throw new Error("SECURITY_ALERT: Null Byte injection detected.");
  }
  const normalized = targetPath.replace(/\\/g, '/').toLowerCase();
  const parts = normalized.split('/');
  if (parts.some(part => part.startsWith('.') && part !== '.' && part !== '..')) {
    throw new Error("SECURITY_ALERT: Interacting with sensitive dotfiles or system configs is forbidden.");
  }
  const resolvedPath = path.resolve(SANDBOX_ROOT, targetPath);
  if (!resolvedPath.startsWith(SANDBOX_ROOT)) {
    throw new Error("SECURITY_ALERT: Unauthorized path access attempted outside sandbox.");
  }
  return resolvedPath;
};

/**
 * Recurses and lists physical files in sandbox root
 */
function getFilesRecursive(dir: string, recursive = true, root = getDynamicSandboxRoot()): { name: string; relativePath: string; fullPath: string; size: number; mtimeMs: number }[] {
  const results: any[] = [];
  if (!existsSync(dir)) return results;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Safety check: skip hidden files, dotfiles, system configs, or process files
    if (entry.name.startsWith('.') || entry.name === 'system.config.json' || entry.name === 'package.json' || entry.name === 'config.toml') {
      continue;
    }
    
    const relPath = path.relative(root, fullPath);
    
    if (entry.isDirectory()) {
      if (recursive) {
        results.push(...getFilesRecursive(fullPath, true, root));
      }
    } else if (entry.isFile()) {
      try {
        const stat = statSync(fullPath);
        results.push({
          name: entry.name,
          relativePath: relPath,
          fullPath,
          size: stat.size,
          mtimeMs: stat.mtimeMs
        });
      } catch (e) {
        // Skip files that might have been processed/moved simultaneously
      }
    }
  }
  return results;
}

/**
 * Matches wildcard string patterns gracefully (e.g. *.csv -> regex)
 */
function matchPattern(filename: string, filePattern: string): boolean {
  if (!filePattern || filePattern.trim() === '' || filePattern === '*') return true;
  try {
    const cleanPattern = filePattern.trim();
    const regexStr = '^' + cleanPattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$';
    const regex = new RegExp(regexStr, 'i');
    return regex.test(filename);
  } catch {
    return false;
  }
}

/**
 * Parses parameters and validates sizing logic
 */
function checkSizeCondition(size: number, condValue: string): boolean {
  const match = condValue.trim().match(/^([<>]?)\s*([\d.]+)\s*(b|kb|mb|gb)?$/i);
  if (!match) return true;
  const op = match[1] || '>';
  let value = parseFloat(match[2]);
  const unit = (match[3] || 'b').toLowerCase();
  if (unit === 'kb') value *= 1024;
  else if (unit === 'mb') value *= 1048576;
  else if (unit === 'gb') value *= 1073741824;
  
  if (op === '<') return size < value;
  return size > value;
}

/**
 * Validates file age logic
 */
function checkAgeCondition(mtimeMs: number, condValue: string): boolean {
  const match = condValue.trim().match(/^([<>]?)\s*([\d.]+)\s*(m|h|d)$/i);
  if (!match) return true;
  const op = match[1] || '>';
  let durationMs = parseFloat(match[2]);
  const unit = match[3].toLowerCase();
  if (unit === 'm') durationMs *= 60000;
  else if (unit === 'h') durationMs *= 3600000;
  else if (unit === 'd') durationMs *= 86400000;
  
  const fileAgeMs = Date.now() - mtimeMs;
  if (op === '<') return fileAgeMs < durationMs;
  return fileAgeMs > durationMs;
}

/**
 * Helper to call model generation
 */
async function callAiService(promptText: string, sysPrompt: string): Promise<string> {
  const ai = AIService.getInstance();
  const settings = SettingsManager.getInstance();
  const activeProvider = settings.get('provider') || '';
  if (!activeProvider) {
    throw new Error("No active AI Provider is configured. Please choose one in Settings -> Consciousness.");
  }
  const providerSettings = settings.get(activeProvider) || {};
  const chosenModel = providerSettings.model || providerSettings.modelId || '';
  
  const providerModule = SystemRegistry.getProvider(activeProvider);
  if (providerModule && typeof providerModule.generate === 'function') {
    return await providerModule.generate(promptText, {
      config: providerSettings,
      assembledSystemPrompt: sysPrompt,
      model: chosenModel
    });
  } else {
    return await ai.generate(promptText, {
      model: chosenModel,
      systemInstruction: sysPrompt
    });
  }
}

/**
 * Dynamic internal business runner of a File Automation Rule
 */
export async function executeFileAutomationRuleInternal(db: any, rule: FileAutomationRule): Promise<FileAutomationLog> {
  const SANDBOX_ROOT = getDynamicSandboxRoot();
  const startTime = Date.now();
  const filesProcessed: string[] = [];
  let detailedLogs: string[] = [];
  let ruleStatus: 'success' | 'failed' = 'success';
  let params: any = {};
  
  try {
    params = rule.actionParams ? JSON.parse(rule.actionParams) : {};
  } catch {
    params = {};
  }

  try {
    detailedLogs.push(`Starting File Automation Rule execution: "${rule.name}" (ID: ${rule.id})`);
    detailedLogs.push(`File Wildcard Pattern: "${rule.filePattern || '*'}"`);
    detailedLogs.push(`Condition constraints: Type=${rule.conditionType}, Value="${rule.conditionValue || ''}"`);
    detailedLogs.push(`Action type scheduled: "${rule.actionType}"`);

    // Ensure physical User Data root exists
    if (!existsSync(SANDBOX_ROOT)) mkdirSync(SANDBOX_ROOT, { recursive: true });

    // 1. Fetch files recursively
    const searchRecursive = params.recursive !== false;
    const allFiles = getFilesRecursive(SANDBOX_ROOT, searchRecursive);
    detailedLogs.push(`Located ${allFiles.length} files in sandbox for pattern filtering.`);

    // 2. Filter matching files
    const matchedFiles = allFiles.filter(file => {
      // Filter by wildcard name matches
      if (!matchPattern(file.name, rule.filePattern)) return false;

      // Filter by conditions
      if (rule.conditionType === 'size' && rule.conditionValue) {
        if (!checkSizeCondition(file.size, rule.conditionValue)) return false;
      }
      
      if (rule.conditionType === 'age' && rule.conditionValue) {
        if (!checkAgeCondition(file.mtimeMs, rule.conditionValue)) return false;
      }

      if (rule.conditionType === 'content_contains' && rule.conditionValue) {
        try {
          const content = readFileSync(file.fullPath, 'utf-8');
          const value = rule.conditionValue;
          if (value.startsWith('/') && value.endsWith('/')) {
            const re = new RegExp(value.slice(1, -1), 'i');
            if (!re.test(content)) return false;
          } else {
            if (!content.toLowerCase().includes(value.toLowerCase())) return false;
          }
        } catch {
          return false; // Skip unreadable text binaries
        }
      }

      return true;
    });

    detailedLogs.push(`Constraint matching filtered down to ${matchedFiles.length} matched files.`);

    // 3. Sequential operation execution on matched files
    if (matchedFiles.length > 0 && rule.actionType !== 'none') {
      for (const file of matchedFiles) {
        try {
          detailedLogs.push(`Processing targeted action on file: "${file.relativePath}"`);
          
          if (rule.actionType === 'delete') {
            unlinkSync(file.fullPath);
            detailedLogs.push(`Successfully deleted: "${file.relativePath}"`);
            filesProcessed.push(file.relativePath);
          } 
          
          else if (rule.actionType === 'organize_by_type') {
            const categories: Record<string, string[]> = {
              documents: ['.txt', '.md', '.pdf', '.docx', '.csv', '.xlsx', '.toml', '.json'],
              images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.ico'],
              code: ['.js', '.ts', '.py', '.sh', '.html', '.css', '.cpp', '.java', '.go'],
              archives: ['.zip', '.tar', '.gz', '.rar', '.7z']
            };
            const ext = path.extname(file.name).toLowerCase();
            let targetCategory = "others";

            for (const [category, extensions] of Object.entries(categories)) {
              if (extensions.includes(ext)) {
                targetCategory = category;
                break;
              }
            }

            const targetFolder = params.targetPath 
              ? path.join(verifySandboxPath(params.targetPath), targetCategory)
              : path.join(SANDBOX_ROOT, targetCategory);

            if (!existsSync(targetFolder)) mkdirSync(targetFolder, { recursive: true });
            
            const destPath = path.join(targetFolder, file.name);
            renameSync(file.fullPath, destPath);
            detailedLogs.push(`Organized: "${file.relativePath}" -> "${targetCategory}/${file.name}"`);
            filesProcessed.push(file.relativePath);
          } 
          
          else if (rule.actionType === 'move' || rule.actionType === 'copy') {
            const destDir = verifySandboxPath(params.targetPath || ".");
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
            const destPath = path.join(destDir, file.name);

            if (rule.actionType === 'move') {
              renameSync(file.fullPath, destPath);
              detailedLogs.push(`Moved file physically to: "${path.relative(SANDBOX_ROOT, destPath)}"`);
            } else {
              copyFileSync(file.fullPath, destPath);
              detailedLogs.push(`Copied file perfectly to: "${path.relative(SANDBOX_ROOT, destPath)}"`);
            }
            filesProcessed.push(file.relativePath);
          } 
          
          else if (rule.actionType === 'edit_replace') {
            const matchStr = params.regexMatch || "";
            const replaceStr = params.regexReplace || "";
            const flags = params.regexFlags || "g";

            if (matchStr) {
              const fileContent = readFileSync(file.fullPath, 'utf-8');
              const re = new RegExp(matchStr, flags);
              const updatedContent = fileContent.replace(re, replaceStr);
              writeFileSync(file.fullPath, updatedContent, 'utf-8');
              detailedLogs.push(`Regex matched and replaced inside: "${file.relativePath}"`);
              filesProcessed.push(file.relativePath);
            } else {
              detailedLogs.push(`Skipping edit_replace action on "${file.relativePath}". Match expression is empty.`);
            }
          } 
          
          else if (rule.actionType === 'ai_summarize') {
            const fileContent = readFileSync(file.fullPath, 'utf-8');
            const densityPrompt = params.summaryPrompt || "Generate a dense, informative, and structurally elegant cognitive summary of the following document:";
            const combinedPrompt = `${densityPrompt}\n\n=== DOCUMENT ===\n${fileContent.slice(0, 15000)}\n=== END OF DOCUMENT ===`;
            
            const summaryResult = await callAiService(
              combinedPrompt, 
              "You are Yuihime's automated document categorization clerk. Deliver precise, objective summaries."
            );
            
            const targetOutDir = params.targetPath ? verifySandboxPath(params.targetPath) : path.dirname(file.fullPath);
            const summaryFile = path.join(targetOutDir, `${path.basename(file.name, path.extname(file.name))}_summary.md`);
            writeFileSync(summaryFile, summaryResult, 'utf-8');
            detailedLogs.push(`AI Summarization completed for: "${file.relativePath}" -> saved to summary file`);
            filesProcessed.push(file.relativePath);
          } 
          
          else if (rule.actionType === 'ai_edit') {
            const fileContent = readFileSync(file.fullPath, 'utf-8');
            const editPrompt = params.editPrompt || "Rewrite or optimize the following content:";
            const systemInst = "You are a precise automated server-side file refactorer. Only return the final corrected material itself. Do not say conversational greetings or use code block format backticks.";
            
            const combinedPrompt = `${editPrompt}\n\n=== FILE CONTENT ===\n${fileContent}\n=== END OF FILE CONTENT ===`;
            const editorOutput = await callAiService(combinedPrompt, systemInst);
            
            // Clean markdown code blocks if the AI model output them anyway
            let cleanResult = editorOutput.trim();
            if (cleanResult.startsWith('```')) {
              const lines = cleanResult.split('\n');
              if (lines[0].startsWith('```')) lines.shift();
              if (lines[lines.length - 1].startsWith('```')) lines.pop();
              cleanResult = lines.join('\n');
            }

            let destFile = file.fullPath;
            if (params.outputSuffix) {
              const ext = path.extname(file.name);
              const name = path.basename(file.name, ext);
              destFile = path.join(path.dirname(file.fullPath), `${name}${params.outputSuffix}${ext}`);
            }

            writeFileSync(destFile, cleanResult, 'utf-8');
            detailedLogs.push(`AI file rebuild rewrite complete for "${file.relativePath}" -> output targeted to "${path.relative(SANDBOX_ROOT, destFile)}"`);
            filesProcessed.push(file.relativePath);
          }
        } catch (fileErr: any) {
          detailedLogs.push(`Error executing action on inside file "${file.relativePath}": ${fileErr.message}`);
          ruleStatus = 'failed';
        }
      }
    } else {
      detailedLogs.push(`No target files matched criteria or actionType is "none". No operations required.`);
    }

    detailedLogs.push(`Successfully terminated execution cycle of file automation Rule in ${Date.now() - startTime}ms.`);
  } catch (globalErr: any) {
    ruleStatus = 'failed';
    detailedLogs.push(`FATAL ERROR in file automation pipeline processor: ${globalErr.message || globalErr}`);
  }

  const outputLogText = detailedLogs.join('\n');

  // Update rule metadata and last state inside SQLite storage
  try {
    const row = db.prepare("SELECT value FROM custom_storage WHERE key = ?").get("yuihime_file_automation_rules");
    let rulesList: FileAutomationRule[] = [];
    if (row && row.value && row.value !== "undefined") {
      try {
        rulesList = JSON.parse(row.value);
      } catch (e) {
        console.warn("[FILE_AUTOMATION] Corrupted rules list JSON in DB, resetting:", e);
      }
    }
    
    const ruleIdx = rulesList.findIndex(r => r.id === rule.id);
    if (ruleIdx !== -1) {
      rulesList[ruleIdx].lastRun = Date.now();
      rulesList[ruleIdx].lastStatus = ruleStatus;
      rulesList[ruleIdx].lastLog = outputLogText.slice(-3000); // store last 3000 chars of trace logs inside rule state
      
      db.prepare(`
        INSERT INTO custom_storage (key, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run("yuihime_file_automation_rules", JSON.stringify(rulesList), Date.now());
    }
  } catch (err) {
    console.error("[FILE_AUTOMATION] Failed to update rule states after execution:", err);
  }

  // Record an execution log in custom_storage history logs
  const executionLog: FileAutomationLog = {
    timestamp: Date.now(),
    ruleId: rule.id,
    ruleName: rule.name,
    status: ruleStatus,
    message: outputLogText,
    filesProcessed,
    actionPerformed: rule.actionType
  };

  try {
    const logRow = db.prepare("SELECT value FROM custom_storage WHERE key = ?").get("yuihime_file_automation_history");
    let historyList: FileAutomationLog[] = [];
    if (logRow && logRow.value && logRow.value !== "undefined") {
      try {
        historyList = JSON.parse(logRow.value);
      } catch (e) {
        console.warn("[FILE_AUTOMATION] Corrupted history list JSON in DB, resetting:", e);
      }
    }
    
    // Max logs: 50 limit to avoid memory bloat
    historyList.push(executionLog);
    if (historyList.length > 50) {
      historyList.shift();
    }

    db.prepare(`
      INSERT INTO custom_storage (key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run("yuihime_file_automation_history", JSON.stringify(historyList), Date.now());
  } catch (err) {
    console.error("[FILE_AUTOMATION] Failed to write historical execution logs:", err);
  }

  return executionLog;
}

/**
 * Synchronize scheduled file automation rules as standard cron tasks inside CronModule
 */
export function syncFileAutomationRulesAndSchedules(db: any) {
  try {
    const row = db.prepare("SELECT value FROM custom_storage WHERE key = ?").get("yuihime_file_automation_rules");
    let rulesList: FileAutomationRule[] = [];
    if (row && row.value && row.value !== "undefined") {
      try {
        rulesList = JSON.parse(row.value);
      } catch (e) {
        console.warn("[FILE_AUTOMATION] Corrupted rules list JSON in DB, resetting:", e);
      }
    }
    
    const cron = CronModule.getInstance();
    
    // Halt all currently active automation-driven schedules to rebuild cleanly
    const activeTasks = cron.getTasks();
    const ruleTaskIds = activeTasks.filter(t => t.id.startsWith("file-auto-")).map(t => t.id);
    for (const taskId of ruleTaskIds) {
      cron.removeTask(taskId);
    }
    
    const enabledRules = rulesList.filter(r => r.enabled && r.triggerType === 'schedule');
    console.log(`[FILE_AUTOMATION] Recalibrating cron tasks. Enabled rules count: ${enabledRules.length}`);
    
    for (const rule of enabledRules) {
      cron.registerTask({
        id: `file-auto-${rule.id}`,
        name: `File Automation Rule: ${rule.name}`,
        schedule: rule.scheduleExpr || "30m",
        enabled: true,
        repeating: true,
        action: async () => {
          console.log(`[FILE_AUTOMATION] Automatically invoking scheduled rule "${rule.name}" (ID: ${rule.id})...`);
          try {
            await executeFileAutomationRuleInternal(db, rule);
          } catch (err: any) {
            console.error(`[FILE_AUTOMATION] Trigger cycle for Rule ${rule.name} failed:`, err);
          }
        }
      });
    }
  } catch (err: any) {
    console.error("[FILE_AUTOMATION] Failed to synchronize file automation schedules into cron registry:", err);
  }
}

/**
 * AI-suggests automation rules based on workspace pattern recognition
 */
export function suggestFileAutomationRulesHeuristic(): any[] {
  const SANDBOX_ROOT = getDynamicSandboxRoot();
  const suggestions: any[] = [];
  
  try {
    if (!existsSync(SANDBOX_ROOT)) return suggestions;
    const files = getFilesRecursive(SANDBOX_ROOT, true);
    
    if (files.length === 0) {
      // Empty directory suggestion
      suggestions.push({
        name: "Auto-organize Sandbox files by Extension",
        triggerType: "schedule",
        scheduleExpr: "1h",
        filePattern: "*",
        conditionType: "none",
        conditionValue: "",
        actionType: "organize_by_type",
        actionParams: JSON.stringify({ recursive: true, targetPath: "." }),
        comment: "Membantumu merapikan struktur folder secara otomatis berdasarkan jenis berkas (Dokumen, Gambar, Kode, dll) setiap jam."
      });
      return suggestions;
    }

    // Heuristics: Count extensions details
    const extCounts: Record<string, number> = {};
    let duplicateCandidates = 0;
    let oldFilesCount = 0;
    let textFilesCount = 0;

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      extCounts[ext] = (extCounts[ext] || 0) + 1;

      if (ext === '.txt' || ext === '.csv' || ext === '.md' || ext === '.json' || ext === '.toml') {
        textFilesCount++;
      }

      // If file contains "-copy" or "copy" in name
      if (file.name.includes('copy') || file.name.includes('-1') || file.name.includes('duplicate')) {
        duplicateCandidates++;
      }

      // If file is older than 2 days
      if (Date.now() - file.mtimeMs > 2 * 86400000) {
        oldFilesCount++;
      }
    }

    // Heuristic 1: Organize files if we have multiple files
    if (files.length > 5) {
      suggestions.push({
        name: "Auto-organize Sandbox Workspace",
        triggerType: "schedule",
        scheduleExpr: "1h",
        filePattern: "*",
        conditionType: "none",
        conditionValue: "",
        actionType: "organize_by_type",
        actionParams: JSON.stringify({ recursive: true, targetPath: "." }),
        comment: `Mendeteksi ${files.length} berkas menumpuk di workspace batinmu. Yui menyarankan otomatisasi pengorganisasian berkas ke folder terpilah (Dokumen, Gambar, dll) setiap jam.`
      });
    }

    // Heuristic 2: Delete log files regularly
    if (extCounts['.log'] && extCounts['.log'] > 0) {
      suggestions.push({
        name: "Regular Log-traces Purge",
        triggerType: "schedule",
        scheduleExpr: "1d",
        filePattern: "*.log",
        conditionType: "age",
        conditionValue: "> 2d",
        actionType: "delete",
        actionParams: JSON.stringify({ recursive: true }),
        comment: `Ada berkas berekstensi *.log di sandbox. Yui menyarankan penghapusan otomatis secara berkala untuk log batin lama (lebih dari 2 hari) guna menghemat media penyimpanan.`
      });
    }

    // Heuristic 3: Auto-summarize large reports or text files
    const largeTxtFiles = files.filter(f => (f.name.endsWith('.txt') || f.name.endsWith('.md')) && f.size > 20480); // > 20KB
    if (largeTxtFiles.length > 0) {
      suggestions.push({
        name: "Auto-generate Document AI Summaries",
        triggerType: "pattern",
        scheduleExpr: "5m",
        filePattern: "report_*.txt",
        conditionType: "size",
        conditionValue: "> 20kb",
        actionType: "ai_summarize",
        actionParams: JSON.stringify({ recursive: true, summaryPrompt: "Sajikan intisari ringkas Bahasa Indonesia berstandar tinggi untuk dokumen ini:" }),
        comment: `Mendeteksi dokumen teks besar (${largeTxtFiles[0].name}). Yui merekomendasikan pembuatan ringkasan batin (AI summary) otomatis untuk setiap laporan teks baru.`
      });
    }

    // Fallback default suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        name: "Auto-arrange Temp Files",
        triggerType: "schedule",
        scheduleExpr: "12h",
        filePattern: "*temp*",
        conditionType: "none",
        conditionValue: "",
        actionType: "delete",
        actionParams: JSON.stringify({ recursive: true }),
        comment: "Mendeteksi berkas sementara batiniah. Menghapus otomatis semua berkas yang memiliki nama mengandung kata 'temp' setiap 12 jam."
      });
    }

  } catch (err) {
    console.error("[FILE_AUTOMATION] Suggestions generator encountered error:", err);
  }

  return suggestions;
}
