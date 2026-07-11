import { EmotionState, EmotionDelta } from "../include/types";

export function applyEmotionDelta(current: EmotionState, delta: EmotionDelta): EmotionState {
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
  
  return {
    arousal: clamp(current.arousal + (delta.arousal || 0), 0, 100),
    valence: clamp(current.valence + (delta.valence || 0), -100, 100),
    focus: clamp(current.focus + (delta.focus || 0), 0, 100),
    rapport: clamp(current.rapport + (delta.rapport || 0), 0, 100),
    lastUpdate: Date.now()
  };
}

export function serializeEmotion(state: EmotionState) {
  return {
    arousal: state.arousal,
    valence: state.valence,
    focus: state.focus,
    rapport: state.rapport,
    timestamp: state.lastUpdate
  };
}
