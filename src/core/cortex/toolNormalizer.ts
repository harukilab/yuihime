/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractJsonObject } from './jsonExtract';
import { genId } from '@shared/core/idGen';

export function normalizeToolCall(tc: any): any {
  if (!tc) return null;
  let name = tc.tool || tc.name || tc.function?.name || "";
  let args = tc.args || tc.arguments || tc.function?.arguments || {};
  if (typeof args === 'string') {
    try {
      const _tMatch = extractJsonObject(args);
      args = _tMatch ? JSON.parse(_tMatch) : {};
    } catch (e) {
      console.warn("[normalizer] Failed parsing string args:", args);
    }
  }
  if (typeof args !== 'object' || args === null) {
    args = {};
  }
  const id = tc.id || tc.tool_call_id || `call_${genId(10)}`;

  // Alias map: LLM may emit these old/common names — map to registered tool IDs.
  const toolAliases: Record<string, string> = {
    // websearch
    'google_search': 'websearch',
    'search_web': 'websearch',
    'web_search': 'websearch',
    // bash
    'run_command': 'bash',
    'execute_command': 'bash',
    'shell': 'bash',
    'terminal': 'bash',
    'run_shell': 'bash',
    'cmd': 'bash',
    'sh': 'bash',
    // code_interpreter
    'python': 'code_interpreter',
    'run_python': 'code_interpreter',
    // glob
    'list_dir': 'glob',
    'ls': 'glob',
    // edit
    'edit_file': 'edit',
    'edit_segment': 'edit',
    'replace': 'edit',
    // webfetch
    'web_fetch': 'webfetch',
    'web_snipper': 'webfetch',
    'scrape': 'webfetch',
    'scrape_web': 'webfetch',
    // question
    'ask_user': 'question',
    'ask': 'question',
    'confirm': 'question',
    // apply_patch
    'patch': 'apply_patch',
    'apply_diff': 'apply_patch',
    // old tool IDs → new IDs
    'read_file': 'read',
    'write_file': 'write',
    'list_files': 'glob',
    // plugin_installer
    'plugin-installer': 'plugin_installer',
    'install_addon': 'plugin_installer',
    'install_plugin': 'plugin_installer',
    // file_manager
    'file_automation': 'file_manager',
    // view_logs
    'view_system_logs': 'view_logs',
    // search_chat_history
    'search_memory': 'search_chat_history',
    'memory_search': 'search_chat_history',
    // generate_image (registered id of the TensorArt driver)
    'tensorart_generate': 'generate_image',
    'create_image': 'generate_image',
    'image_generation': 'generate_image',
    'text_to_image': 'generate_image',
    'txt2img': 'generate_image',
    'draw': 'generate_image',
    'dalle': 'generate_image',
    'dall_e': 'generate_image',
    'dall-e': 'generate_image',
    'generateImage': 'generate_image',
  };

  const lowerName = name.trim().toLowerCase();
  if (toolAliases[lowerName]) {
    console.log(`[TOOL_NORMALIZER] Mapping '${name}' -> '${toolAliases[lowerName]}'`);
    name = toolAliases[lowerName];
  }

  // Parameter normalizations: adapt common param aliases to current tool schemas
  if (name === 'bash') {
    const rawCmd = args.command || args.cmd || args.commandText || args.code || args.exec || args.script;
    if (rawCmd) args.command = rawCmd;
  } else if (name === 'websearch') {
    const rawQuery = args.query || args.q || args.searchQuery || args.search;
    if (rawQuery) args.query = rawQuery;
  } else if (name === 'write') {
    const rawPath = args.filename || args.filePath || args.path || args.file;
    const rawContent = args.content || args.data || args.text || args.body;
    if (rawPath) args.path = rawPath;
    if (rawContent) args.content = rawContent;
  } else if (name === 'read') {
    const rawPath = args.filename || args.filePath || args.path || args.file;
    if (rawPath) args.path = rawPath;
  } else if (name === 'glob') {
    const rawPath = args.filename || args.dir || args.directory || args.folder || args.path;
    if (rawPath && !args.path) args.path = rawPath;
  } else if (name === 'edit') {
    const rawPath = args.filename || args.filePath || args.path || args.file;
    if (rawPath && !args.path) args.path = rawPath;
  } else if (name === 'file_manager') {
    const rawTarget = args.target || args.path || args.source;
    if (rawTarget && args.target === undefined) args.target = rawTarget;
    if (Array.isArray(args.files) === false && typeof args.file === 'string') {
      args.files = [args.file];
    }
  }

  return {
    id,
    type: 'function',
    tool: name,
    name,
    args,
    function: {
      name,
      arguments: args
    }
  };
}
