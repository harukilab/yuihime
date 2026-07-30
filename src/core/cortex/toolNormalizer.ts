/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function normalizeToolCall(tc: any): any {
  if (!tc) return null;
  let name = tc.tool || tc.name || tc.function?.name || "";
  let args = tc.args || tc.arguments || tc.function?.arguments || {};
  if (typeof args === 'string') {
    try {
      const _tMatch = args.match(/\{[\s\S]*\}/);
      args = _tMatch ? JSON.parse(_tMatch[0]) : {};
    } catch (e) {
      console.warn("[normalizer] Failed parsing string args:", args);
    }
  }
  if (typeof args !== 'object' || args === null) {
    args = {};
  }
  // Keep the canonical OpenAI-native `id` (generate one when missing) so the
  // cortex can propagate `role: "tool"` result messages with a stable `tool_call_id`.
  const id = tc.id || tc.tool_call_id || `call_${Math.random().toString(36).slice(2, 10)}`;

  // Clean / normalize tool names to actual registered IDs
  const toolAliases: { [key: string]: string } = {
    'google_search': 'web_search',
    'search_web': 'web_search',
    'search': 'web_search',
    'google': 'web_search',
    'websearch': 'web_search',
    'create_image': 'generate_image',
    'image_generation': 'generate_image',
    'run_command': 'run_command',
    'execute_command': 'run_command',
    'exec_command': 'run_command',
    'command_executor': 'run_command',
    'shell': 'run_command',
    'terminal': 'run_command',
    'shell_execution': 'run_command',
    'exec': 'run_command',
    'execute': 'run_command',
    'run': 'run_command',
    'bash': 'run_command',
    'cmd': 'run_command',
    'sh': 'run_command',
    'run_shell': 'run_command',
    'run_code': 'code_interpreter',
    'python': 'code_interpreter',
    'python_exec': 'code_interpreter',
    'python_interpreter_tool': 'code_interpreter',
    'run_python': 'code_interpreter',
    'write_file_tool': 'write_file',
    'read_file_tool': 'read_file',
    'list_files_tool': 'list_files',
    'list_dir': 'list_files',
    'ls': 'list_files',
    'modify_file': 'file_automation',
    'file_manipulate_tool': 'file_automation',
    'file_automation': 'file_manager',
    'view_system_logs': 'view_logs',
    'view_system_log': 'view_logs',
    'search_memory': 'search_chat',
    'memory_search': 'search_chat',
    'chat_search': 'search_chat',
    'adjust_emotion': 'set_emotion',
    'send_message': 'send_message',
    'telegram_message': 'send_message',
    'send_telegram': 'send_message',
    'set_nickname': 'update_user_profile',
    'update_identity': 'update_user_profile'
  };

  const lowerName = name.trim().toLowerCase();
  if (toolAliases[lowerName]) {
    console.log(`[TOOL_NORMALIZER] Mapping tool alias '${name}' -> '${toolAliases[lowerName]}'`);
    name = toolAliases[lowerName];
  }

  // Parameter normalizations for common tools to maximize compatibility
  if (name === 'run_command') {
    const rawCmd = args.command || args.cmd || args.commandText || args.code || args.exec || args.script;
    if (rawCmd) {
      args.command = rawCmd;
    }
  } else if (name === 'web_search') {
    const rawQuery = args.query || args.q || args.searchQuery || args.search;
    if (rawQuery) {
      args.query = rawQuery;
    }
  } else if (name === 'write_file') {
    const rawPath = args.filename || args.filePath || args.path || args.file;
    const rawContent = args.content || args.data || args.text || args.body;
    if (rawPath) args.filename = rawPath;
    if (rawContent) args.content = rawContent;
  } else if (name === 'read_file') {
    const rawPath = args.filename || args.filePath || args.path || args.file;
    if (rawPath) args.filename = rawPath;
  } else if (name === 'search_chat') {
    // Memory-search legacy param `type` (memory-type filter) maps to `memoryType`.
    if (args.memoryType === undefined && args.type !== undefined) {
      args.memoryType = args.type;
    }
    // Default scope to 'chat' unless explicitly requested.
    if (args.scope === undefined) {
      args.scope = 'chat';
    }
  } else if (name === 'file_manager') {
    // Legacy file_automation param aliases.
    const rawTarget = args.target || args.path || args.source;
    if (rawTarget && args.target === undefined) args.target = rawTarget;
    if (Array.isArray(args.files) === false && typeof args.file === 'string') {
      args.files = [args.file];
    }
  }

  // Return an OpenAI-native tool call enriched with backward-compatible aliases
  // (`tool`, `name`, `args`) so downstream modules (NeuralLoop, executor)
  // keep working while the canonical contract is preserved.
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
