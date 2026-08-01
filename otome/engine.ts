import fs from 'fs';
import path from 'path';
import os from 'os';
import { SCENES, endingFor, type Scene, type Choice } from './scenarios.js';
import { YUI_PROFILE } from './character.js';

export interface OtomeState {
  sceneId: string;
  affection: number;
  flags: string[];
  day: number;
  finished: string | null;
  lastChoice?: string;
  savedAt?: number;
}

export type AffectionLevel = 'cold' | 'warm' | 'flirty' | 'love';

export function affectionLevel(affection: number): AffectionLevel {
  if (affection >= 80) return 'love';
  if (affection >= 50) return 'flirty';
  if (affection >= 20) return 'warm';
  return 'cold';
}

export function petNameFor(affection: number): string {
  const lvl = affectionLevel(affection);
  if (lvl === 'love') return YUI_PROFILE.petNames.affection_high;
  if (lvl === 'warm' || lvl === 'flirty') return YUI_PROFILE.petNames.affection_mid;
  return YUI_PROFILE.petNames.affection_low;
}

export interface AvailableChoice extends Choice {
  locked: boolean;
}

const SAVE_DIR = path.join(os.homedir(), '.yuihime', 'otome_saves');

function defaultState(): OtomeState {
  return { sceneId: 'start', affection: 10, flags: [], day: 1, finished: null };
}

export class OtomeGame {
  state: OtomeState;
  history: string[] = [];

  constructor(state?: OtomeState) {
    this.state = state ?? defaultState();
  }

  currentScene(): Scene {
    if (this.state.finished) {
      return endingFor(this.state.affection, this.state.flags);
    }
    return SCENES[this.state.sceneId] ?? SCENES.start;
  }

  availableChoices(): AvailableChoice[] {
    const scene = this.currentScene();
    if (!scene.choices.length) return [];
    return scene.choices.map(c => ({
      ...c,
      locked: c.requiresAffection !== undefined && this.state.affection < c.requiresAffection
    }));
  }

  choose(index: number): { scene: Scene; delta: number; ending: string | null } {
    const choices = this.availableChoices();
    const choice = choices[index];
    if (!choice || choice.locked) {
      return { scene: this.currentScene(), delta: 0, ending: null };
    }
    const delta = choice.affection ?? 0;
    this.state.affection = Math.max(0, Math.min(100, this.state.affection + delta));
    for (const f of choice.flags ?? []) {
      if (!this.state.flags.includes(f)) this.state.flags.push(f);
    }
    this.history.push(`${this.state.sceneId} -> ${choice.next} (${delta >= 0 ? '+' : ''}${delta})`);
    this.state.lastChoice = choice.label;
    this.state.sceneId = choice.next;

    if (choice.next === 'ending_eval') {
      const ending = endingFor(this.state.affection, this.state.flags);
      this.state.sceneId = ending.id;
      this.state.finished = ending.ending ?? null;
      return { scene: ending, delta, ending: ending.ending ?? null };
    }
    const nextScene = SCENES[choice.next];
    if (nextScene?.ending) {
      this.state.sceneId = nextScene.id;
      this.state.finished = nextScene.ending;
      return { scene: nextScene, delta, ending: nextScene.ending };
    }
    return { scene: this.currentScene(), delta, ending: null };
  }

  newDay(): void {
    if (this.state.finished === 'love') {
      this.state.sceneId = 'couple_start';
      if (!this.state.flags.includes('relationship')) this.state.flags.push('relationship');
      this.state.finished = null;
      this.state.day += 1;
      this.history = [];
      return;
    }
    this.state = defaultState();
    this.state.day = (this.state.day || 1) + 1;
    this.history = [];
  }

  save(file = 'autosave.json'): string {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    this.state.savedAt = Date.now();
    const p = path.join(SAVE_DIR, file);
    fs.writeFileSync(p, JSON.stringify(this.state, null, 2), 'utf8');
    return p;
  }

  static load(file = 'autosave.json'): OtomeGame | null {
    const p = path.join(SAVE_DIR, file);
    if (!fs.existsSync(p)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8')) as OtomeState;
      return new OtomeGame(data);
    } catch (e) {
      console.warn('[OTOME] Save file corrupt, starting fresh.', e);
      return null;
    }
  }

  static saveDir(): string {
    return SAVE_DIR;
  }
}
