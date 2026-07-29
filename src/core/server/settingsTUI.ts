import readline from "readline";
import { SettingsManager } from "../kernel/settings.js";
import { SystemRegistry } from "@shared/core/registry";
import { ModuleType } from "@shared/include/types";
import { initializeBot } from "./telegram.js";
import { initializeDiscord } from "./discord.js";
import { initializeTwitter } from "./twitter.js";
import { initializeMCP } from "./mcp.js";
import { broadcastToWS } from "./apiRouter.js";
import { clearCortexSettingsCache } from "../cortex/cortexSettings.js";
import { PluginManager } from "../kernel/PluginManager.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const DIM = "\x1b[2m";

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}

function drawHeader(title: string) {
  clearScreen();
  console.log(`${CYAN}┌────────────────────────────────────────────────────────┐${RESET}`);
  console.log(`${CYAN}│${RESET} ${BOLD}${GREEN}${title.padEnd(56)}${CYAN}│${RESET}`);
  console.log(`${CYAN}└────────────────────────────────────────────────────────┘${RESET}`);
}

function ask(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

function getModuleTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cortex: "Consciousness",
    tool: "Tools",
    tts: "Speech",
    provider: "AI Providers",
    gateway: "Bridges",
    addon: "Addons",
    io: "I/O",
  };
  return labels[type.toLowerCase()] || type;
}

function getConfigurableModules(): any[] {
  const allModules = SystemRegistry.getModules();
  return allModules.filter(
    (m: any) => m.metadata?.configSchema?.fields && Object.keys(m.metadata.configSchema.fields).length > 0
  );
}

function groupModulesByType(modules: any[]): Map<string, any[]> {
  const grouped = new Map<string, any[]>();
  for (const mod of modules) {
    const type = mod.metadata.type || ModuleType.CORTEX;
    const label = getModuleTypeLabel(type);
    if (!grouped.has(label)) {
      grouped.set(label, []);
    }
    grouped.get(label)!.push(mod);
  }
  return grouped;
}

async function renderModuleList(
  rl: readline.Interface,
  settings: any
): Promise<string | null> {
  const modules = getConfigurableModules();
  if (modules.length === 0) {
    console.log(`${YELLOW}No configurable modules found.${RESET}`);
    const ans = await ask(rl, "Press Enter to return...");
    return null;
  }

  const grouped = groupModulesByType(modules);
  let lineIdx = 0;
  const indexToModule = new Map<number, any>();

  drawHeader("⚙ Settings Editor");
  console.log(`${BOLD}Current configuration loaded from config.toml${RESET}\n`);

  for (const [typeLabel, mods] of grouped) {
    console.log(`${BOLD}${BLUE}── ${typeLabel} ──${RESET}`);
    for (const mod of mods) {
      const idx = lineIdx + 1;
      indexToModule.set(idx, mod);
      const moduleId = mod.metadata.id;
      const currentSection = settings[moduleId];
      const hasConfig = currentSection && Object.keys(currentSection).length > 0;
      console.log(`  ${GREEN}${idx.toString().padStart(3)}.${RESET} ${BOLD}${mod.metadata.name}${RESET} ${hasConfig ? `${CYAN}(${Object.keys(currentSection).length} fields set)${RESET}` : `${DIM}(no settings)${RESET}`}`);
      lineIdx++;
    }
    console.log();
  }

  console.log(`${DIM}─────────────────────────────────────────────────────────${RESET}`);
  console.log(`  ${GREEN}b${RESET} = back to list (when editing a field)`);
  console.log(`  ${GREEN}s${RESET} = save & exit`);
  console.log(`  ${GREEN}q${RESET} = quit without saving`);
  console.log();

  const ans = await ask(rl, `Select module (1-${lineIdx}): `);
  if (ans.toLowerCase() === "q") {
    return "quit";
  }
  if (ans.toLowerCase() === "s") {
    return "save";
  }
  const idx = parseInt(ans, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= lineIdx) {
    return indexToModule.get(idx)?.metadata.id || null;
  }
  return null;
}

async function renderField(
  rl: readline.Interface,
  field: any,
  fieldName: string,
  currentValue: any
): Promise<any> {
  const type = field.type;
  const label = field.label || fieldName;
  const description = field.description || "";
  const defaultValue = field.default !== undefined ? field.default : "";

  if (description) {
    console.log(`  ${DIM}${description}${RESET}`);
  }

  let displayValue = currentValue;
  if (type === "password" && currentValue) {
    displayValue = "••••••••";
  }
  if (type === "boolean") {
    displayValue = currentValue ? `${GREEN}[✓] Enabled${RESET}` : `${RED}[ ] Disabled${RESET}`;
  }
  if (type === "multiselect" && Array.isArray(currentValue)) {
    displayValue = currentValue.length > 0 ? `${currentValue.length} selected` : "None selected";
  }

  console.log(`  ${CYAN}${label}${RESET}: ${displayValue !== undefined && displayValue !== null ? String(displayValue) : `${DIM}(not set)${RESET}`}`);

  const prompt = `  ${GREEN}▶ ${label}${RESET}${type === "boolean" ? " (y/n)" : type === "number" || type === "slider" ? " (number)" : type === "password" ? " (hidden)" : ""}: `;
  const input = await ask(rl, prompt);

  if (input.toLowerCase() === "b") {
    return "__BACK__";
  }

  switch (type) {
    case "boolean": {
      const lower = input.toLowerCase();
      if (lower === "y" || lower === "yes" || lower === "1" || lower === "true") {
        return true;
      }
      if (lower === "n" || lower === "no" || lower === "0" || lower === "false") {
        return false;
      }
      console.log(`${RED}Invalid boolean value. Use y/n.${RESET}`);
      return currentValue;
    }
    case "number": {
      const num = parseFloat(input);
      if (isNaN(num)) {
        console.log(`${RED}Invalid number. Keeping current value.${RESET}`);
        return currentValue;
      }
      if (field.min !== undefined && num < field.min) {
        console.log(`${RED}Value below minimum (${field.min}). Clamped.${RESET}`);
        return field.min;
      }
      if (field.max !== undefined && num > field.max) {
        console.log(`${RED}Value above maximum (${field.max}). Clamped.${RESET}`);
        return field.max;
      }
      return num;
    }
    case "slider": {
      const num = parseFloat(input);
      if (isNaN(num)) {
        console.log(`${RED}Invalid number. Keeping current value.${RESET}`);
        return currentValue;
      }
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const clamped = Math.max(min, Math.min(max, num));
      if (clamped !== num) {
        console.log(`${YELLOW}Clamped to range [${min}-${max}].${RESET}`);
      }
      return clamped;
    }
    case "select": {
      const options = field.options || [];
      if (options.length === 0) {
        return input || defaultValue;
      }
      console.log();
      options.forEach((opt: any, i: number) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const label2 = typeof opt === "string" ? opt : opt.label;
        const isSelected = currentValue === val;
        console.log(`    ${isSelected ? `${GREEN}▶${RESET}` : " "} ${i + 1}. ${label2}`);
      });
      console.log();
      const optIdx = parseInt(input, 10) - 1;
      if (!isNaN(optIdx) && optIdx >= 0 && optIdx < options.length) {
        const chosen = options[optIdx];
        return typeof chosen === "string" ? chosen : chosen.value;
      }
      if (input && input.trim()) {
        return input;
      }
      return currentValue;
    }
    case "multiselect": {
      const options = field.options || [];
      if (options.length === 0) {
        return input ? input.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      }
      const currentArr = Array.isArray(currentValue) ? currentValue : [];
      console.log();
      const displayedOptions: any[] = [];
      options.forEach((opt: any, i: number) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const label2 = typeof opt === "string" ? opt : opt.label;
        const isSelected = currentArr.includes(val);
        displayedOptions.push({ value: val, label: label2, selected: isSelected });
        console.log(`    ${isSelected ? `${GREEN}☑${RESET}` : `${RED}☐${RESET}`} ${i + 1}. ${label2}`);
      });
      console.log();
      console.log(`${DIM}Enter numbers to toggle (comma-separated), e.g. "1,3,5"${RESET}`);
      const toggleInput = await ask(rl, `  Toggle: `);
      if (toggleInput.toLowerCase() === "b") {
        return "__BACK__";
      }
      const newArr = [...currentArr];
      const toggleParts = toggleInput.split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const part of toggleParts) {
        const tIdx = parseInt(part, 10) - 1;
        if (!isNaN(tIdx) && tIdx >= 0 && tIdx < displayedOptions.length) {
          const optVal = displayedOptions[tIdx].value;
          const existingIdx = newArr.indexOf(optVal);
          if (existingIdx >= 0) {
            newArr.splice(existingIdx, 1);
          } else {
            newArr.push(optVal);
          }
        }
      }
      return newArr;
    }
    case "textarea": {
      if (input === "") {
        return defaultValue;
      }
      return input;
    }
    case "password":
    case "string":
    case "color": {
      return input || defaultValue;
    }
    default:
      return input || defaultValue;
  }
}

async function renderModuleConfig(
  rl: readline.Interface,
  moduleId: string,
  modules: any[],
  settings: any
): Promise<{ moduleId: string; config: any } | null> {
  const module = modules.find((m: any) => m.metadata.id === moduleId);
  if (!module) return null;

  const schema = module.metadata.configSchema;
  if (!schema || !schema.fields) return null;

  const currentConfig = (settings[moduleId] as any) || {};
  const updatedConfig = { ...currentConfig };
  const fields = schema.fields;
  const fieldNames = Object.keys(fields);

  drawHeader(`⚙ ${module.metadata.name}`);
  console.log(`${DIM}${module.metadata.description || ""}${RESET}\n`);

  let i = 0;
  for (const fieldName of fieldNames) {
    const field = fields[fieldName];
    const displayNum = i + 1;
    const currentVal = updatedConfig[fieldName] !== undefined ? updatedConfig[fieldName] : field.default;
    console.log(`  ${BLUE}${displayNum}.${RESET} ${field.label || fieldName} ${DIM}(${field.type})${RESET}`);
    i++;
  }

  console.log();
  console.log(`${DIM}─────────────────────────────────────────────────────────${RESET}`);
  const input = await ask(rl, `Edit field (1-${fieldNames.length}), or ${GREEN}b${RESET} to go back, ${GREEN}s${RESET} to save & exit: `);

  if (input.toLowerCase() === "b") {
    return null;
  }
  if (input.toLowerCase() === "s") {
    return { moduleId, config: updatedConfig };
  }

  const fieldIdx = parseInt(input, 10) - 1;
  if (isNaN(fieldIdx) || fieldIdx < 0 || fieldIdx >= fieldNames.length) {
    console.log(`${RED}Invalid selection.${RESET}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { moduleId, config: updatedConfig };
  }

  const fieldName = fieldNames[fieldIdx];
  const field = fields[fieldName];

  let options: any[] = [];
  if (field.dynamicOptions && module.getDynamicOptions) {
    console.log(`${YELLOW}  Loading options...${RESET}`);
    try {
      options = await module.getDynamicOptions(fieldName, updatedConfig);
    } catch (e: any) {
      console.log(`${RED}  Failed to load dynamic options: ${e.message}${RESET}`);
    }
  }

  const effectiveField = options.length > 0
    ? { ...field, options: options.map((o: any) => ({ label: o.label, value: o.value })) }
    : field;

  const newValue = await renderField(rl, effectiveField, fieldName, updatedConfig[fieldName]);
  if (newValue === "__BACK__") {
    return null;
  }
  updatedConfig[fieldName] = newValue;

  return { moduleId, config: updatedConfig };
}

async function saveAndReinit(settings: any, db: any): Promise<void> {
  await SettingsManager.getInstance().save(settings);

  try {
    clearCortexSettingsCache();
  } catch (e: any) {
    console.warn(`${RED}[SETTINGS] Failed to clear cortex cache: ${e.message}${RESET}`);
  }

  try {
    await PluginManager.getInstance().loadPlugins();
  } catch (e: any) {
    console.warn(`${YELLOW}[SETTINGS] Failed to reload plugins: ${e.message}${RESET}`);
  }

  try {
    if (db) {
      await initializeBot(db, true).catch((e: any) => {
        console.warn(`${YELLOW}[SETTINGS] Telegram re-init failed: ${e.message}${RESET}`);
      });
      await initializeDiscord(db, true).catch((e: any) => {
        console.warn(`${YELLOW}[SETTINGS] Discord re-init failed: ${e.message}${RESET}`);
      });
      await initializeTwitter(db, true).catch((e: any) => {
        console.warn(`${YELLOW}[SETTINGS] Twitter re-init failed: ${e.message}${RESET}`);
      });
    }
    await initializeMCP(true).catch((e: any) => {
      console.warn(`${YELLOW}[SETTINGS] MCP re-init failed: ${e.message}${RESET}`);
    });
  } catch (e: any) {
    console.warn(`${RED}[SETTINGS] Bridge re-init error: ${e.message}${RESET}`);
  }

  broadcastToWS({ type: "settings_update", data: settings });
  console.log(`${GREEN}${BOLD}Settings saved and bridges reinitialized.${RESET}`);
}

export async function startSettingsTUI(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let settings: any = {};
  try {
    settings = await SettingsManager.getInstance().load();
  } catch (e: any) {
    console.error(`${RED}Failed to load settings: ${e.message}${RESET}`);
    rl.close();
    return;
  }

  let unsavedChanges = false;
  let currentSettings = { ...settings };

  try {
    while (true) {
      drawHeader("⚙ Settings Editor");
      console.log(`${DIM}Type number to select module, ${GREEN}s${DIM} to save, ${GREEN}q${DIM} to quit${RESET}\n`);

      const modules = getConfigurableModules();
      if (modules.length === 0) {
        console.log(`${YELLOW}No configurable modules found.${RESET}`);
        break;
      }

      const grouped = groupModulesByType(modules);
      let lineIdx = 0;
      const indexToModule = new Map<number, any>();

      for (const [typeLabel, mods] of grouped) {
        console.log(`${BOLD}${BLUE}── ${typeLabel} ──${RESET}`);
        for (const mod of mods) {
          const idx = lineIdx + 1;
          indexToModule.set(idx, mod);
          const moduleId = mod.metadata.id;
          const currentSection = currentSettings[moduleId];
          const hasConfig = currentSection && Object.keys(currentSection).length > 0;
          console.log(`  ${GREEN}${idx.toString().padStart(3)}.${RESET} ${BOLD}${mod.metadata.name}${RESET} ${hasConfig ? `${CYAN}(${Object.keys(currentSection).length} fields)${RESET}` : `${DIM}(default)${RESET}`}`);
          lineIdx++;
        }
        console.log();
      }

      console.log(`${DIM}─────────────────────────────────────────────────────────${RESET}`);
      const input = await ask(rl, `Select module (1-${lineIdx}), ${GREEN}s${RESET} to save & exit, ${GREEN}q${RESET} to quit: `);

      if (input.toLowerCase() === "q") {
        if (unsavedChanges) {
          const confirm = await ask(rl, `${YELLOW}You have unsaved changes. Quit anyway? (y/N): ${RESET}`);
          if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
            continue;
          }
        }
        break;
      }

      if (input.toLowerCase() === "s") {
        const db = (globalThis as any).yuihime_db;
        await saveAndReinit(currentSettings, db);
        unsavedChanges = false;
        continue;
      }

      const idx = parseInt(input, 10);
      if (isNaN(idx) || idx < 1 || idx > lineIdx) {
        console.log(`${RED}Invalid selection.${RESET}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const selectedModule = indexToModule.get(idx);
      if (!selectedModule) continue;

      const moduleId = selectedModule.metadata.id;
      const result = await renderModuleConfig(rl, moduleId, modules, currentSettings);
      if (result) {
        currentSettings[result.moduleId] = result.config;
        unsavedChanges = true;
      }
    }
  } catch (e: any) {
    console.error(`${RED}Settings TUI error: ${e.message}${RESET}`);
  } finally {
    rl.close();
  }
}