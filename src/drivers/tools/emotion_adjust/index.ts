import { ToolModule, EmotionDelta } from "../../../include/types";
import { applyEmotionDelta, serializeEmotion } from "../../../modules/EmotionUtils";
import manifest from "./manifest.json";

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
