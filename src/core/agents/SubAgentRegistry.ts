import { SubAgentDefinition } from './SubAgentTypes';

class SubAgentRegistryClass {
  private static instance: SubAgentRegistryClass;
  private agents: Map<string, SubAgentDefinition> = new Map();

  private constructor() {}

  public static getInstance(): SubAgentRegistryClass {
    if (!SubAgentRegistryClass.instance) {
      SubAgentRegistryClass.instance = new SubAgentRegistryClass();
    }
    return SubAgentRegistryClass.instance;
  }

  register(definition: SubAgentDefinition) {
    if (!definition || !definition.id) {
      console.warn('[SUBAGENT_REGISTRY] Attempted to register invalid agent', definition);
      return;
    }
    const isUpdate = this.agents.has(definition.id);
    console.log(`[SUBAGENT_REGISTRY] ${isUpdate ? 'Updating' : 'Registering'} sub-agent: ${definition.id}`);
    this.agents.set(definition.id, definition);
  }

  unregister(id: string) {
    console.log(`[SUBAGENT_REGISTRY] Unregistering sub-agent: ${id}`);
    this.agents.delete(id);
  }

  get(id: string): SubAgentDefinition | undefined {
    return this.agents.get(id);
  }

  getAll(): SubAgentDefinition[] {
    return Array.from(this.agents.values());
  }

  clear() {
    this.agents.clear();
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }
}

export const SubAgentRegistry = SubAgentRegistryClass.getInstance();
