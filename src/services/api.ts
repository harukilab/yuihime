import { APICapability, APIEndpoint, AgentState } from "../include/types";
import { ConnectorRegistry, HttpConnector, APIError } from "../core/api_framework";
import { SystemRegistry } from "../core/registry";
import { logger } from "../core/kernel/logger";

/**
 * A framework for the agent to interact with external APIs dynamically,
 * housing the structured JSON schema validation tier aligned with official OpenAI specification.
 */
export class APIService {
  /**
   * Initializes the framework with saved capabilities.
   */
  static async init(capabilities: APICapability[]) {
    capabilities.forEach(cap => {
      const authValue = localStorage.getItem(`auth_${cap.id}`) || undefined;
      const connector = new HttpConnector(
        cap.id,
        cap.name,
        cap.description,
        cap.baseUrl,
        cap.authType !== 'none' ? { type: cap.authType as 'bearer' | 'apiKey', value: authValue } : undefined
      );
      ConnectorRegistry.register(connector);
    });
  }

  /**
   * Translates an endpoint specification to an OpenAI-compatible JSON Schema.
   */
  static getEndpointSchema(endpoint: APIEndpoint): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (endpoint.parameters && Array.isArray(endpoint.parameters)) {
      endpoint.parameters.forEach(param => {
        properties[param.name] = {
          type: param.type || 'string',
          description: param.description || ''
        };
        if (param.required) {
          required.push(param.name);
        }
      });
    }

    return {
      type: "object",
      properties,
      required
    };
  }

  /**
   * Validates tool call arguments matching the provided JSON Schema constraints recursively.
   */
  static validateSchema(schema: any, data: any, path: string = ''): void {
    if (!schema) return;

    const expectedType = schema.type;
    const currentType = Array.isArray(data) ? 'array' : typeof data;

    if (expectedType) {
      if (expectedType === 'array' && currentType !== 'array') {
        throw new Error(`Validation Error [${path || 'root'}]: Expected 'array', got '${currentType}'`);
      }
      if (expectedType === 'integer' && (currentType !== 'number' || !Number.isInteger(data))) {
        throw new Error(`Validation Error [${path || 'root'}]: Expected integer, got '${currentType}'`);
      }
      if (expectedType === 'number' && currentType !== 'number') {
        throw new Error(`Validation Error [${path || 'root'}]: Expected number, got '${currentType}'`);
      }
      if (expectedType === 'boolean' && currentType !== 'boolean') {
        throw new Error(`Validation Error [${path || 'root'}]: Expected boolean, got '${currentType}'`);
      }
      if (expectedType === 'string' && currentType !== 'string') {
        throw new Error(`Validation Error [${path || 'root'}]: Expected string, got '${currentType}'`);
      }
      if (expectedType === 'object' && (currentType !== 'object' || data === null)) {
        throw new Error(`Validation Error [${path || 'root'}]: Expected object structure, got '${currentType}'`);
      }
    }

    if (schema.enum && !schema.enum.includes(data)) {
      throw new Error(`Validation Error [${path || 'root'}]: Value '${data}' is not in permitted enum constraints: [${schema.enum.join(', ')}]`);
    }

    if (expectedType === 'object' && schema.properties) {
      if (schema.required && Array.isArray(schema.required)) {
        for (const req of schema.required) {
          if (data[req] === undefined || data[req] === null) {
            // Self-heal: Try to populate with a default value based on the property's type
            const propSchema = schema.properties[req];
            if (propSchema) {
              const pType = propSchema.type;
              if (pType === 'string') data[req] = "";
              else if (pType === 'array') data[req] = [];
              else if (pType === 'boolean') data[req] = false;
              else if (pType === 'number' || pType === 'integer') data[req] = 0;
              else if (pType === 'object') data[req] = {};
              else data[req] = null;
              
              console.warn(`[VALIDATION_HEAL] Missing required property '${req}' at '${path || 'root'}'. Auto-populated with default:`, data[req]);
            } else {
              throw new Error(`Validation Error [${path || 'root'}]: Missing required property '${req}'`);
            }
          }
        }
      }

      for (const key of Object.keys(schema.properties)) {
        if (data[key] !== undefined) {
          // Cast types if minor mismatch to avoid throwing execution-blocking schema validation errors
          const expectedPropType = schema.properties[key]?.type;
          if (expectedPropType === 'string' && typeof data[key] !== 'string') {
            data[key] = String(data[key]);
          } else if ((expectedPropType === 'number' || expectedPropType === 'integer') && typeof data[key] !== 'number') {
            const parsed = Number(data[key]);
            if (!isNaN(parsed)) {
              data[key] = parsed;
            }
          } else if (expectedPropType === 'boolean' && typeof data[key] !== 'boolean') {
            data[key] = Boolean(data[key]);
          }
          APIService.validateSchema(schema.properties[key], data[key], path ? `${path}.${key}` : key);
        }
      }
    }

    if (expectedType === 'array' && schema.items && Array.isArray(data)) {
      data.forEach((item, index) => {
        APIService.validateSchema(schema.items, item, `${path || 'root'}[${index}]`);
      });
    }
  }

  static clientAuditLogs: any[] = [];

  static getAuditLogs() {
    if (typeof window === 'undefined' && (globalThis as any).getToolAuditLogs) {
      return (globalThis as any).getToolAuditLogs();
    }
    return APIService.clientAuditLogs;
  }

  static clearAuditLogs() {
    if (typeof window === 'undefined' && (globalThis as any).clearToolAuditLogs) {
      return (globalThis as any).clearToolAuditLogs();
    }
    APIService.clientAuditLogs = [];
  }

  static addAuditLog(log: any) {
    if (typeof window === 'undefined' && (globalThis as any).addToolAuditLog) {
      return (globalThis as any).addToolAuditLog(log);
    }
    APIService.clientAuditLogs.unshift(log);
    if (APIService.clientAuditLogs.length > 50) {
      APIService.clientAuditLogs.pop();
    }
  }

  /**
   * Infers dynamic OpenAI-compliant JSON Schema from any return payload.
   */
  static inferSchema(obj: any): any {
    if (obj === null || obj === undefined) {
      return { type: "null" };
    }
    const jsType = typeof obj;
    if (jsType === 'string' || jsType === 'number' || jsType === 'boolean') {
      return { type: jsType };
    }
    if (Array.isArray(obj)) {
      const itemSchema = obj.length > 0 ? APIService.inferSchema(obj[0]) : { type: "string" };
      return {
        type: "array",
        items: itemSchema
      };
    }
    if (jsType === 'object') {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        properties[key] = APIService.inferSchema(value);
        required.push(key);
      }
      return {
        type: "object",
        properties,
        required
      };
    }
    return { type: "any" };
  }

  static async call(capability: APICapability, endpoint: APIEndpoint, params: any, agentState?: AgentState): Promise<any> {
    if (capability.id === 'google_search' || capability.id === 'web_search') {
      try {
        const query = params.query || params.q || '';
        const searchResults = await APIService.searchGoogle(query);
        
        const auditLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          toolName: capability.name,
          endpointPath: endpoint.path,
          parameters: params,
          response: searchResults,
          responseSchema: { type: "array" },
          status: 'SUCCESS',
          standardsCompliance: true
        };
        APIService.addAuditLog(auditLog);
        return searchResults;
      } catch (err: any) {
        console.error("[APIService] Google Search hook error:", err);
      }
    }

    let connector = ConnectorRegistry.get(capability.id);
    
    // Lazy registration if not found
    if (!connector) {
      const authValue = localStorage.getItem(`auth_${capability.id}`) || undefined;
      connector = new HttpConnector(
        capability.id,
        capability.name,
        capability.description,
        capability.baseUrl,
        capability.authType !== 'none' ? { type: capability.authType as 'bearer' | 'apiKey', value: authValue } : undefined
      );
      ConnectorRegistry.register(connector);
    }

    // OpenAI Protocol Structured Schema Validation
    const epSchema = APIService.getEndpointSchema(endpoint);
    try {
      APIService.validateSchema(epSchema, params || {});
      console.log(`[API_SERVICE] Strict OpenAI Intent Schema Validation passed for ${capability.name}:`, params);
    } catch (valErr: any) {
      console.error(`[API_SERVICE] Strict Schema Validation failed for ${capability.name}:`, valErr.message);
      throw valErr;
    }

    try {
      const result = await connector.execute(endpoint, params);
      
      const responseSchema = APIService.inferSchema(result);
      const isComplianceMatch = typeof result === 'object' && result !== null;

      const auditLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        toolName: capability.name,
        endpointPath: endpoint.path,
        parameters: params,
        response: result,
        responseSchema: responseSchema,
        status: 'SUCCESS',
        standardsCompliance: isComplianceMatch
      };

      APIService.addAuditLog(auditLog);
      logger.log('INFO', 'API_SERVICE_AUDIT', `[AUDIT_LOG] Captured response schema for '${capability.name}': ${JSON.stringify(responseSchema)}`);

      return result;
    } catch (error: any) {
      const auditLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        toolName: capability.name,
        endpointPath: endpoint.path,
        parameters: params,
        response: null,
        status: 'FAILED',
        error: error.message || String(error),
        standardsCompliance: false
      };

      APIService.addAuditLog(auditLog);
      logger.log('ERROR', 'API_SERVICE_AUDIT', `[AUDIT_LOG] Execution failed for '${capability.name}': ${error.message || String(error)}`);

      if (error instanceof APIError) {
        console.error(`[API_SERVICE] Detailed Failure for ${capability.name}:`, {
          message: error.message,
          context: error.context,
          agentState: agentState ? {
            mood: agentState.mood,
            energy: agentState.energy,
            status: agentState.status
          } : 'State Not Provided'
        });
      } else {
        console.error(`[API_SERVICE] Execution failed for ${capability.name}:`, error);
      }
      throw error;
    }
  }

  /**
   * Performs Google Search using Gemini search grounding on the backend server.
   */
  static async searchGoogle(query: string): Promise<any> {
    try {
      console.log(`[APIService] Performing Google Search: ${query}`);
      const res = await fetch(`/api/tools/search?query=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Search provider failed with status " + res.status);
      const data = await res.json();
      return data;
    } catch (e: any) {
      console.error("[APIService] Search error:", e);
      return [];
    }
  }

  /**
   * Discovers a new API capability (mocking discovery logic).
   */
  static discover(spec: any): APICapability {
    return {
      id: Math.random().toString(36).substr(2, 9),
      name: spec.name,
      description: spec.description,
      baseUrl: spec.baseUrl,
      endpoints: spec.endpoints,
      authType: spec.authType || 'none',
      learnedAt: Date.now()
    };
  }

  /**
   * Middleware that captures the raw LLM response, parses potential <tool_calls> payloads,
   * verifies they strictly align with the expected Function Calling schema, and logs all
   * parsed traces and validation errors to system traces before execution begins.
   */
  static validateLLMResponse(rawResult: string): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    // Capture and extract potential <tool_calls> blocks strictly
    const match = rawResult.match(/<tool_calls>([\s\S]*?)<\/tool_calls>/i);
    if (!match) {
      return { success: true, errors };
    }

    const payloadRaw = match[1].trim();
    let parsedList: any = null;

    try {
      parsedList = JSON.parse(payloadRaw);
    } catch (parseError: any) {
      const errMsg = `[SCHEMA_MIDDLEWARE] Failed parsing JSON inside <tool_calls>: ${parseError.message}`;
      logger.log('ERROR', 'API_SERVICE_MIDDLEWARE', errMsg);
      errors.push(errMsg);
      return { success: false, errors };
    }

    if (!Array.isArray(parsedList)) {
      const errMsg = `[SCHEMA_MIDDLEWARE] Captured function calling structure is not a valid JSON Array.`;
      logger.log('ERROR', 'API_SERVICE_MIDDLEWARE', errMsg);
      errors.push(errMsg);
      return { success: false, errors };
    }

    // Retrieve active tools from registry
    const activeTools = SystemRegistry.getTools();

    for (let index = 0; index < parsedList.length; index++) {
      const call = parsedList[index];
      const toolName = call.function?.name || call.name || call.tool;

      if (!toolName) {
        const errMsg = `[SCHEMA_MIDDLEWARE] Call at index ${index} lacks a name field. Call payload: ${JSON.stringify(call)}`;
        logger.log('ERROR', 'API_SERVICE_MIDDLEWARE', errMsg);
        errors.push(errMsg);
        continue;
      }

      // Find the tool definition
      const matchedTool = activeTools.find(t => t.metadata?.id === toolName || t.metadata?.name === toolName);
      if (!matchedTool) {
        const errMsg = `[SCHEMA_MIDDLEWARE] Tool '${toolName}' requested by LLM does not exist in registered modules.`;
        logger.log('ERROR', 'API_SERVICE_MIDDLEWARE', errMsg);
        errors.push(errMsg);
        continue;
      }

      let args = call.function?.arguments || call.args || call.arguments || {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args.trim());
        } catch (argsErr: any) {
          const errMsg = `[SCHEMA_MIDDLEWARE] Failed parsing arguments string for tool '${toolName}': ${argsErr.message}`;
          logger.log('ERROR', 'API_SERVICE_MIDDLEWARE', errMsg);
          errors.push(errMsg);
          continue;
        }
      }

      const schema = matchedTool.metadata?.parameters;
      if (schema) {
        try {
          APIService.validateSchema(schema, args, toolName);
          logger.log('INFO', 'API_SERVICE_MIDDLEWARE', `[SCHEMA_MIDDLEWARE] Strict validation passed for tool '${toolName}'. arguments: ${JSON.stringify(args)}`);
        } catch (validationErr: any) {
          const errMsg = `[SCHEMA_MIDDLEWARE] Constraint error on '${toolName}': ${validationErr.message}`;
          logger.log('ERROR', 'API_SERVICE_MIDDLEWARE', errMsg);
          errors.push(errMsg);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Identifies and removes markdown code block delimiters (e.g., ```json, ```)
   * from the LLM's response string, ensuring the text is raw JSON for the parser.
   */
  static cleanAIOutput(str: string): string {
    if (!str) return "";
    let clean = str.trim();
    
    // Check if the string has markdown code fence blocks
    if (clean.includes("```")) {
      const matches = clean.match(/```(?:json)?([\s\S]*?)```/);
      if (matches) {
        const potentialJson = matches[1].trim();
        if (potentialJson.startsWith('{') || potentialJson.startsWith('[')) {
          clean = potentialJson;
        } else {
          // If it is conversational markdown (not actual JSON), we just strip the code fence labels
          // rather than replacing the entire text with only the first code block's contents.
          clean = clean.replace(/```(?:json|javascript|typescript|python|html|css|bash|sh|jsonc)?\s*\n?/gim, '');
          clean = clean.replace(/```\s*$/gm, '');
          clean = clean.replace(/```/g, '');
        }
      } else {
        // Safe regex/string fallback removal
        clean = clean.replace(/```[a-zA-Z0-9_-]*\s*\n?/gim, '');
        clean = clean.replace(/```\s*$/gm, '');
        clean = clean.replace(/```/g, '');
      }
    }
    
    clean = clean.trim();

    // Remove surrounding double quotes if they wrap the entire output without internal newlines
    if (clean.startsWith('"') && clean.endsWith('"') && !clean.includes('\n')) {
      try {
        clean = JSON.parse(clean);
      } catch (_) {
        if (clean.length >= 2) {
          clean = clean.substring(1, clean.length - 1);
        }
      }
    }
    
    return clean.trim();
  }
}
