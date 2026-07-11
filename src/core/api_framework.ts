import { APICapability, APIEndpoint } from "../include/types";

export interface APIConnector {
  id: string;
  name: string;
  description: string;
  execute(endpoint: APIEndpoint, params: any): Promise<any>;
}

export class DiscoveryService {
  /**
   * Discovers available API stubs based on registered connectors 
   * and potentially external sources.
   */
  static async discover(): Promise<APICapability[]> {
    const connectors = ConnectorRegistry.getAll();
    return connectors.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      baseUrl: (c as any).baseUrl || '',
      endpoints: (c as any).endpoints || [],
      authType: (c as any).authConfig?.type || 'none',
      learnedAt: Date.now()
    }));
  }
}

export class AuthManager {
  private static credentials: Map<string, string> = new Map();

  static setCredential(serviceId: string, token: string) {
    this.credentials.set(serviceId, token);
  }

  static getCredential(serviceId: string): string | undefined {
    return this.credentials.get(serviceId);
  }
}

export class ConnectorRegistry {
  private static connectors: Map<string, APIConnector> = new Map();

  static register(connector: APIConnector) {
    this.connectors.set(connector.id, connector);
  }

  static get(id: string): APIConnector | undefined {
    return this.connectors.get(id);
  }

  static getAll(): APIConnector[] {
    return Array.from(this.connectors.values());
  }
}

export class APIError extends Error {
  constructor(
    message: string,
    public context: {
      id: string;
      name: string;
      endpoint: APIEndpoint;
      params: any;
      status?: number;
      statusText?: string;
      baseUrl: string;
    }
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Default HttpConnector handles standard REST APIs.
 */
export class HttpConnector implements APIConnector {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    private baseUrl: string,
    private authConfig?: { type: 'bearer' | 'apiKey', value?: string }
  ) {}

  async execute(endpoint: APIEndpoint, params: any): Promise<any> {
    const url = new URL(this.baseUrl + endpoint.path);
    const options: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (this.authConfig) {
      if (this.authConfig.type === 'bearer' && this.authConfig.value) {
        options.headers = { ...options.headers, 'Authorization': `Bearer ${this.authConfig.value}` };
      }
    }

    if (endpoint.method === 'GET') {
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    } else {
      options.body = JSON.stringify(params);
    }

    try {
      const response = await fetch(url.toString(), options);
      if (!response.ok) {
        throw new APIError(`HTTP ${response.status}: ${response.statusText}`, {
          id: this.id,
          name: this.name,
          endpoint,
          params,
          status: response.status,
          statusText: response.statusText,
          baseUrl: this.baseUrl
        });
      }
      return await response.json();
    } catch (error) {
      if (error instanceof APIError) throw error;
      
      throw new APIError(error instanceof Error ? error.message : 'Unknown Network Error', {
        id: this.id,
        name: this.name,
        endpoint,
        params,
        baseUrl: this.baseUrl
      });
    }
  }
}
