type Listener = (data?: any) => void;

class EventBus {
  private events: Map<string, Listener[]> = new Map();

  on(event: string, listener: Listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener) {
    const listeners = this.events.get(event);
    if (listeners) {
      this.events.set(event, listeners.filter(l => l !== listener));
    }
  }

  emit(event: string, data?: any) {
    this.events.get(event)?.forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        console.error(`[EVENT_BUS] Error in listener for ${event}:`, e);
      }
    });
  }
}

export const eventBus = new EventBus();
