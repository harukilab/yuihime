import { ToolModule, EmotionDelta } from "@shared/include/types";
import { applyEmotionDelta, serializeEmotion } from "../../modules/EmotionUtils";

const manifest = {
  "id": "set_emotion",
  "name": "Set Emotion",
  "description": "Adjust the assistant's current emotion state (arousal, valence, focus, rapport).",
  "version": "0.4.0",
  "type": "TOOL",
  "order": 0,
  "parameters": {
    "type": "object",
    "properties": {
      "arousal": { "type": "number", "description": "Adjustment to arousal (intensity)." },
      "valence": { "type": "number", "description": "Adjustment to valence (positivity/negativity)." },
      "focus": { "type": "number", "description": "Adjustment to focus (concentration)." },
      "rapport": { "type": "number", "description": "Adjustment to rapport (connection with user)." }
    }
  }
} as const;

export const EmotionAdjustTool: ToolModule = {
  metadata: manifest as any,

  execute: async (args: EmotionDelta, context: any) => {
    const { state } = context;
    if (!state) throw new Error("Agent state not provided to tool context.");
    
    if (!state.emotion) {
      state.emotion = {
        arousal: 50,
        valence: 0,
        focus: 50,
        rapport: 50,
        lastUpdate: Date.now()
      };
    }

    const nextState = applyEmotionDelta(state.emotion, args);
    state.emotion = nextState;

    console.log(`[EMOTION] Tool execution result: Δ arousal=${args.arousal || 0}, Δ valence=${args.valence || 0} -> New Valence=${nextState.valence}`);

    return {
      status: "ok",
      new_state: serializeEmotion(nextState)
    };
  }
};
