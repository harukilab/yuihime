export interface TaskSnapshot {
  taskId: string;
  originalPrompt: string;
  currentStep: number;
  accumulatingBuffer: {
    animations: string[];
    moodImpacts: Record<string, number>;
  };
  toolsToExecute: Array<{ name: string; args: any }>;
  observationHistory: Array<any>;
  contextId?: string;
  chatType?: string;
  userName?: string;
}

export class CognitiveScheduler {
  private static activeTaskStore: Map<string, TaskSnapshot> = new Map();
  private static activeTaskStatus: Map<string, 'running' | 'suspended' | 'completed'> = new Map();
  private static currentTaskId: string | null = null;

  public static setCurrentTask(taskId: string | null) {
    this.currentTaskId = taskId;
    if (taskId) {
      this.activeTaskStatus.set(taskId, 'running');
    }
  }

  public static getCurrentTask(): string | null {
    return this.currentTaskId;
  }

  /**
   * Menyimpan snapshot tugas batin berjalan saat terinterupsi oleh input baru dari Kakak
   */
  public static suspendTask(taskId: string, snapshot: TaskSnapshot) {
    this.activeTaskStore.set(taskId, snapshot);
    this.activeTaskStatus.set(taskId, 'suspended');
    console.log(`[CognitiveScheduler] Task ${taskId} suspended successfully. State saved to store.`);
  }

  /**
   * Mengambil kembali snapshot tugas ketika jalur prioritas utama kembali senggang
   */
  public static resumeTask(taskId: string): TaskSnapshot | null {
    if (this.activeTaskStore.has(taskId)) {
      this.activeTaskStatus.set(taskId, 'running');
      return this.activeTaskStore.get(taskId) || null;
    }
    return null;
  }

  /**
   * Mendapatkan daftar semua tugas yang sedang ditangguhkan
   */
  public static getSuspendedTasks(): TaskSnapshot[] {
    const list: TaskSnapshot[] = [];
    this.activeTaskStatus.forEach((status, taskId) => {
      if (status === 'suspended') {
        const snap = this.activeTaskStore.get(taskId);
        if (snap) list.push(snap);
      }
    });
    return list;
  }

  public static getTaskStatus(taskId: string): 'running' | 'suspended' | 'completed' {
    return this.activeTaskStatus.get(taskId) || 'completed';
  }

  public static completeTask(taskId: string) {
    this.activeTaskStore.delete(taskId);
    this.activeTaskStatus.set(taskId, 'completed');
    console.log(`[CognitiveScheduler] Task ${taskId} marked as completed and cleared.`);
  }
}
