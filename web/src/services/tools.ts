export interface ToolResponse {
  stdout?: string;
  stderr?: string;
  content?: string;
  success?: boolean;
  error?: string;
  files?: string[];
  validationPhase?: {
    verified: boolean;
    feedback?: string;
  };
  path?: string;
  workspacePath?: string;
  absolutePath?: string;
  physicalPath?: string;
  physicalFolder?: string;
  absoluteFolder?: string;
  workspaceFolder?: string;
  detailedFiles?: Array<{
    name: string;
    path: string;
    workspacePath: string;
    absolutePath: string;
    physicalPath?: string;
  }>;
  results?: any[];
}

export type ToolExecuteCallback = (toolName: string, success: boolean, result: ToolResponse) => void;

export class ToolService {
  private static executeCallbacks: ToolExecuteCallback[] = [];

  static onExecute(callback: ToolExecuteCallback) {
    this.executeCallbacks.push(callback);
  }

  private static triggerExecute(toolName: string, success: boolean, result: ToolResponse) {
    for (const cb of this.executeCallbacks) {
      try {
        cb(toolName, success, result);
      } catch (err) {
        console.error('[ToolService Callback Error]', err);
      }
    }
  }

  /**
   * Helper function to strictly validate that the response body is valid JSON
   * and contains the expected fields/structure for the specified tool.
   */
  private static async parseAndValidate(
    res: Response,
    toolName: string,
    validator: (data: any) => void
  ): Promise<ToolResponse> {
    const text = await res.text();
    let data: any;

    try {
      data = JSON.parse(text);
    } catch (parseErr: any) {
      const errMsg = `[ToolService] Failed to parse JSON response from tool '${toolName}': ${parseErr.message}. Raw output: ${text.substring(0, 300)}`;
      console.error(errMsg);
      const errResponse: ToolResponse = {
        success: false,
        error: errMsg,
        stderr: text.substring(0, 1000),
        validationPhase: {
          verified: false,
          feedback: `Invalid JSON response format: ${parseErr.message}`
        }
      };
      this.triggerExecute(toolName, false, errResponse);
      return errResponse;
    }

    if (typeof data !== 'object' || data === null) {
      const errMsg = `[ToolService] Invalid response structure from tool '${toolName}'. Expected an object, but got ${data === null ? 'null' : typeof data}.`;
      console.error(errMsg);
      const errResponse: ToolResponse = {
        success: false,
        error: errMsg,
        validationPhase: {
          verified: false,
          feedback: "Response is not a valid JSON object."
        }
      };
      this.triggerExecute(toolName, false, errResponse);
      return errResponse;
    }

    try {
      // Execute the custom structure validator
      validator(data);
    } catch (valErr: any) {
      const errMsg = `[ToolService] Strict JSON validation failed for tool '${toolName}': ${valErr.message}`;
      console.error(errMsg);
      const errResponse: ToolResponse = {
        ...data,
        success: false,
        error: errMsg,
        validationPhase: {
          verified: false,
          feedback: valErr.message
        }
      };
      this.triggerExecute(toolName, false, errResponse);
      return errResponse;
    }

    // Determine final success based on success attribute or presence of errors
    const success = data.success !== false && !data.error;

    const validatedResponse: ToolResponse = {
      ...data,
      success,
      validationPhase: {
        verified: success,
        feedback: success 
          ? `[ToolService] Validation passed successfully for '${toolName}'.` 
          : `[ToolService] Validation failed: Tool reported error '${data.error || 'Unknown error'}'`
      }
    };

    this.triggerExecute(toolName, success, validatedResponse);
    return validatedResponse;
  }

  static async execShell(command: string): Promise<ToolResponse> {
    const res = await fetch('/api/tools/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });

    return this.parseAndValidate(res, 'execShell', (data) => {
      const hasStdout = 'stdout' in data;
      const hasStderr = 'stderr' in data;
      const hasError = 'error' in data;
      const hasSuccess = 'success' in data;
      
      if (!hasStdout && !hasStderr && !hasError && !hasSuccess) {
        throw new Error("Response must contain 'stdout', 'stderr', 'success' or 'error'.");
      }
    });
  }

  static async writeFile(filename: string, content: string): Promise<ToolResponse> {
    const res = await fetch('/api/tools/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content })
    });

    return this.parseAndValidate(res, 'writeFile', (data) => {
      const hasSuccess = 'success' in data;
      const hasPath = 'path' in data;
      const hasError = 'error' in data;

      if (!hasSuccess && !hasPath && !hasError) {
        throw new Error("Response must contain 'success', 'path' or 'error'.");
      }
    });
  }

  static async readFile(filename: string): Promise<ToolResponse> {
    const res = await fetch(`/api/tools/files/read?filename=${encodeURIComponent(filename)}`);

    return this.parseAndValidate(res, 'readFile', (data) => {
      const hasContent = 'content' in data;
      const hasError = 'error' in data;
      const hasSuccess = 'success' in data;

      if (!hasContent && !hasError && !hasSuccess) {
        throw new Error("Response must contain 'content', 'success' or 'error'.");
      }
    });
  }

  static async listFiles(): Promise<ToolResponse> {
    const res = await fetch('/api/tools/files/list');

    return this.parseAndValidate(res, 'listFiles', (data) => {
      const hasFiles = 'files' in data;
      const hasError = 'error' in data;
      const hasSuccess = 'success' in data;

      if (!hasFiles && !hasError && !hasSuccess) {
        throw new Error("Response must contain 'files', 'success' or 'error'.");
      }

      if (hasFiles && !Array.isArray(data.files)) {
        throw new Error("Field 'files' must be an array of strings.");
      }
    });
  }

  static async webSearch(query: string): Promise<ToolResponse> {
    const res = await fetch(`/api/tools/search?query=${encodeURIComponent(query)}`);

    return this.parseAndValidate(res, 'webSearch', (data) => {
      if (!data) {
        throw new Error("Response is empty.");
      }
    });
  }
}
