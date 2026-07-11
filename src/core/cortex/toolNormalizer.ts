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
      args = JSON.parse(args);
    } catch (e) {
      console.warn("[normalizer] Failed parsing string args:", args);
    }
  }
  if (typeof args !== 'object' || args === null) {
    args = {};
  }

  // Clean / normalize tool names to actual registered IDs
  const toolAliases: { [key: string]: string } = {
    'google_search': 'web_search',
    'search_web': 'web_search',
    'search': 'web_search',
    'google': 'web_search',
    'websearch': 'web_search',
    'run_command': 'shell_exec',
    'execute_command': 'shell_exec',
    'exec_command': 'shell_exec',
    'command_executor': 'shell_exec',
    'shell': 'shell_exec',
    'terminal': 'shell_exec',
    'shell_exec': 'shell_exec',
    'shell_execution': 'shell_exec',
    'exec': 'shell_exec',
    'execute': 'shell_exec',
    'run': 'shell_exec',
    'bash': 'shell_exec',
    'cmd': 'shell_exec',
    'sh': 'shell_exec',
    'run_shell': 'shell_exec',
    'run_python': 'python_interpreter',
    'python': 'python_interpreter',
    'python_exec': 'python_interpreter',
    'python_interpreter_tool': 'python_interpreter',
    'python_interpreter': 'python_interpreter',
    'code_interpreter': 'code_interpreter',
    'run_code': 'code_interpreter',
    'write_file_tool': 'write_file',
    'create_file': 'write_file',
    'read_file_tool': 'read_file',
    'list_files_tool': 'list_files',
    'list_dir': 'list_files',
    'ls': 'list_files',
    'modify_file': 'file_manipulate',
    'file_manipulate_tool': 'file_manipulate',
    'adjust_emotion': 'emotion_adjust',
    'send_message': 'messaging_integration',
    'telegram_message': 'messaging_integration',
    'send_telegram': 'messaging_integration',
    'set_nickname': 'manage_identities',
    'update_identity': 'manage_identities'
  };

  const lowerName = name.trim().toLowerCase();
  if (toolAliases[lowerName]) {
    console.log(`[TOOL_NORMALIZER] Mapping tool alias '${name}' -> '${toolAliases[lowerName]}'`);
    name = toolAliases[lowerName];
  }

  // Parameter normalizations for common tools to maximize compatibility
  if (name === 'shell_exec') {
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
  }

  return {
    tool: name,
    args: args
  };
}
