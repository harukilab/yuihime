#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const CONFIG_PATH = path.join('/home/userland/.yuihime/data/config.toml');

function parseToml(content) {
  const result = {};
  const lines = content.split('\n');
  let currentSection = result;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const sectionName = trimmed.slice(1, -1).trim();
      currentSection = result;
      const parts = sectionName.split('.');
      for (const part of parts) {
        if (!currentSection[part]) currentSection[part] = {};
        currentSection = currentSection[part];
      }
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (!isNaN(value) && value !== '') {
      value = Number(value);
    }

    currentSection[key] = value;
  }

  return result;
}

function serializeToml(obj, indent = 0) {
  let output = '';
  const spaces = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output += `${spaces}[${key}]\n`;
      output += serializeToml(value, indent + 1);
    } else {
      if (Array.isArray(value)) {
        output += `${spaces}${key} = [${value.map(v => `"${v}"`).join(', ')}]\n`;
      } else if (typeof value === 'string') {
        output += `${spaces}${key} = "${value}"\n`;
      } else {
        output += `${spaces}${key} = ${value}\n`;
      }
    }
  }

  return output;
}

function flattenObject(obj, prefix = '') {
  const items = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      items.push(...flattenObject(value, fullKey));
    } else {
      items.push({ key: fullKey, value });
    }
  }
  return items;
}

function setNestedValue(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function clearScreen() {
  console.clear();
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
  let config = parseToml(content);
  let flatConfig = flattenObject(config);

  while (true) {
    clearScreen();
    console.log('=== YuiHime Settings TUI ===\n');

    console.log('Categories:');
    const categories = [...new Set(flatConfig.map(item => item.key.split('.')[0]))];
    categories.forEach((cat, idx) => {
      console.log(`  ${idx + 1}. ${cat}`);
    });
    console.log(`  ${categories.length + 1}. Save & Exit`);
    console.log(`  ${categories.length + 2}. Exit without saving`);

    const choice = await prompt('\nSelect category: ');

    if (choice === String(categories.length + 2)) {
      console.log('Exiting without saving...');
      process.exit(0);
    }

    if (choice === String(categories.length + 1)) {
      fs.writeFileSync(CONFIG_PATH, serializeToml(config));
      console.log('Settings saved successfully!');
      await prompt('Press Enter to exit...');
      process.exit(0);
    }

    const selectedCategory = categories[Number(choice) - 1];
    if (!selectedCategory) {
      await prompt('Invalid selection. Press Enter to continue...');
      continue;
    }

    while (true) {
      clearScreen();
      console.log(`=== ${selectedCategory} ===\n`);

      const items = flatConfig.filter(item => item.key.startsWith(selectedCategory + '.'));
      items.forEach((item, idx) => {
        const displayValue = Array.isArray(item.value)
          ? `[${item.value.join(', ')}]`
          : String(item.value);
        console.log(`  ${idx + 1}. ${item.key.split('.')[1]}: ${displayValue}`);
      });
      console.log(`  ${items.length + 1}. Back`);

      const subChoice = await prompt('\nSelect setting: ');

      if (subChoice === String(items.length + 1)) {
        break;
      }

      const selectedItem = items[Number(subChoice) - 1];
      if (!selectedItem) {
        await prompt('Invalid selection. Press Enter to continue...');
        continue;
      }

      clearScreen();
      console.log(`=== Edit ${selectedItem.key} ===`);
      console.log(`Current value: ${selectedItem.value}\n`);

      const newValue = await prompt('New value (leave empty to cancel): ');
      if (newValue === '') continue;

      let parsedValue;
      if (newValue === 'true') parsedValue = true;
      else if (newValue === 'false') parsedValue = false;
      else if (!isNaN(newValue) && newValue !== '') parsedValue = Number(newValue);
      else parsedValue = newValue;

      setNestedValue(config, selectedItem.key, parsedValue);
      flatConfig = flattenObject(config);
      console.log('Updated!');
      await prompt('Press Enter to continue...');
    }
  }
}

main().catch(console.error);
