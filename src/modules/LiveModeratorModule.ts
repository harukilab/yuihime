import { AgentState, CortexModule } from '../include/types';
import { StorageService } from '../drivers/storage';
import { SystemRegistry } from '../core/registry';

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: number;
}

export interface ModeratorResult {
  selectedMessage: ChatMessage | null;
  contextSummary: string;
  action: 'stay' | 'redirect';
  reasoning: string;
}

export class LiveModeratorModule {
  /**
   * Examines a batch of live chat messages and selects the most relevant one(s) 
   * for the VTuber to respond to, based on the current live topic.
   * It also provides a brief summary of the ignored messages to keep the VTuber aware.
   */
  static async moderateChatBatch(
    messages: ChatMessage[],
    currentTopic: string,
  ): Promise<ModeratorResult> {
    
    if (!messages || messages.length === 0) {
      return { 
        selectedMessage: null, 
        contextSummary: '', 
        action: 'stay',
        reasoning: 'No messages to process.'
      };
    }

    // Use common AI Service instead of hardcoded GeminiProvider
    const aiConfig = await StorageService.getAIConfig();
    
    // Use centralized provider-selector gateway
    const selector = SystemRegistry.getModule<CortexModule>('provider-selector');
    
    if (!selector) {
       // fallback: just pick the last one
       return { 
         selectedMessage: messages[messages.length - 1], 
         contextSummary: "Chat is moving rapidly.", 
         action: 'stay',
         reasoning: 'AI Provider Selector missing.'
       };
    }
    
    const payload = `You are the Live Chat Moderator for AI VTuber Yuihime. 
Your job is to analyze a rapid batch of chat messages from viewers and pick ONE message that is most relevant to the current live topic.
If ALL messages are off-topic, pick one that is safe to acknowledge, and instruct the VTuber to redirect the stream back to the topic.
Filter out spam, hate speech, toxicity, or complete nonsense.

CURRENT TOPIC: "${currentTopic || 'General Chatting'}"

Output MUST be ONLY a valid JSON object, with no other text, preambles or explanations.
Format:
{
  "selectedMessageId": "string id or null",
  "contextSummary": "string",
  "action": "stay" | "redirect",
  "reasoning": "string"
}

Here are the messages:
${JSON.stringify(messages)}`;

    try {
      const resultContext = await selector.run(payload, {} as AgentState, { config: { ...aiConfig, isJson: true } });
      const aiResponse = resultContext.rawResult;
      
      // Robust JSON extraction: Find the first balanced JSON object
      let cleaned = aiResponse.trim();
      let startIndex = cleaned.indexOf('{');
      let finalJson = "";

      if (startIndex !== -1) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        let foundEnd = -1;

        for (let i = startIndex; i < cleaned.length; i++) {
          const char = cleaned[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === '\\') {
            escaped = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === '{') depth++;
            else if (char === '}') {
              depth--;
              if (depth === 0) {
                foundEnd = i;
                break;
              }
            }
          }
        }

        if (foundEnd !== -1) {
          finalJson = cleaned.substring(startIndex, foundEnd + 1);
        }
      }

      if (!finalJson) {
         throw new Error("No valid JSON object found in response");
      }
      
      const result = JSON.parse(finalJson);

      const selected = messages.find(m => m.id === String(result.selectedMessageId)) || null;

      return {
        selectedMessage: selected || messages[messages.length - 1],
        contextSummary: result.contextSummary || "Viewers are chatting.",
        action: (result.action === 'redirect') ? 'redirect' : 'stay',
        reasoning: result.reasoning || "Picked based on relevance."
      };
    } catch (error: any) {
      console.error("Moderator failed to process batch", error);
      return { 
        selectedMessage: messages[messages.length - 1], 
        contextSummary: "Moderator offline. Showing latest.", 
        action: 'stay',
        reasoning: `Error parsing moderator output: ${error.message}`
      };
    }
  }
}
