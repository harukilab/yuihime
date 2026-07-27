import { Sparkles, Brain, Cpu, Terminal, Monitor } from 'lucide-react';

export interface TabDefinition {
  id: string;
  title: string;
  icon?: any;
  componentType: 'stage' | 'settings' | 'custom';
  sectionId?: string | null; // Mapped settings section ID
  subTabId?: string | null;  // Mapped sub-tab ID (e.g. for memory)
}

export class TabRegistry {
  private static tabs: TabDefinition[] = [
    { id: 'stage', title: 'Stage', icon: Sparkles, componentType: 'stage' },
    { id: 'console', title: 'Console', icon: Terminal, componentType: 'settings', sectionId: 'console' },
    { id: 'archive', title: 'Archive', icon: Brain, componentType: 'settings', sectionId: 'memory', subTabId: 'archive' },
    { id: 'persistence', title: 'Persistence', icon: Brain, componentType: 'settings', sectionId: 'memory', subTabId: 'persistence' },
    { id: 'matrix', title: 'Matrix', icon: Cpu, componentType: 'settings', sectionId: 'memory', subTabId: 'heuristics' },
    { id: 'settings', title: 'Settings', icon: Monitor, componentType: 'settings' }
  ];

  public static getTabs(): TabDefinition[] {
    return [...this.tabs];
  }

  public static getTab(id: string): TabDefinition | undefined {
    return this.tabs.find(t => t.id === id);
  }

  public static registerTab(tab: TabDefinition) {
    if (this.tabs.some(t => t.id === tab.id)) {
      this.tabs = this.tabs.filter(t => t.id !== tab.id);
    }
    this.tabs.push(tab);
  }
}
