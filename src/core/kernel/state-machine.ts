export class StateMachine {
  private state: string;
  private transitions: Map<string, Map<string, string>>;

  constructor(initialState: string) {
    this.state = initialState.toUpperCase();
    this.transitions = new Map();
  }

  addTransition(from: string, to: string, event: string) {
    if (!this.transitions.has(from)) {
      this.transitions.set(from, new Map());
    }
    this.transitions.get(from)?.set(event, to);
  }

  transition(event: string) {
    const nextState = this.transitions.get(this.state)?.get(event);
    if (nextState) {
      const prev = this.state;
      this.state = nextState;
      console.log(`[STATE] ${prev} -> ${nextState} (Event: ${event})`);
      return true;
    }
    return false;
  }

  getStatus() {
    return this.state;
  }

  transitionTo(next: string) {
    this.state = next.toUpperCase();
  }

  getState() {
    return this.state;
  }
}

export const stateMachine = new StateMachine('IDLE');
