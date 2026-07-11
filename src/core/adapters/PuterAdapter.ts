export interface CortexResponse {
  response: string;
  logs: string[];
  animations?: string[];
  tool_calls?: { tool: string; args: any }[];
  mood_impact?: any;
  perceivedNameUpdate?: string;
  viewerProfileUpdate?: any;
  linkedAccountUpdate?: string;
  [key: string]: any;
}

export class PuterAdapter {
  /**
   * Convert Cortex response to Puter-compatible format
   */
  static adaptCortexToPuter(cortexResponse: CortexResponse): any {
    let finalResponse = '';
    const puterActions: any[] = [];
    let extraAnimations: string[] = [];

    // Extract speech from tool_calls
    if (cortexResponse.tool_calls && Array.isArray(cortexResponse.tool_calls)) {
      for (const rawCall of cortexResponse.tool_calls) {
        if (!rawCall) continue;
        
        const callObj = rawCall as any;
        // Normalize properties
        const toolName = callObj.tool || callObj.name || callObj.function?.name || "";
        let toolArgs = callObj.args || callObj.arguments || callObj.function?.arguments || {};
        
        if (typeof toolArgs === 'string') {
          try {
            toolArgs = JSON.parse(toolArgs);
          } catch (e) {}
        }

        if (toolName === 'send_final_reply' && toolArgs?.speech) {
          finalResponse = toolArgs.speech;
          if (toolArgs.animations && Array.isArray(toolArgs.animations)) {
            extraAnimations = [...extraAnimations, ...toolArgs.animations];
          }
        } else if (toolName === 'send_message') {
          puterActions.push({
            type: 'message',
            target: toolArgs?.target,
            content: toolArgs?.content
          });
        } else if (toolName === 'trigger_action') {
          puterActions.push({
            type: 'action',
            name: toolArgs?.action_name || toolArgs?.name,
            params: toolArgs?.params || toolArgs
          });
        }
      }
    }

    // Default fallback to direct response if no specific tool call is caught
    if (!finalResponse && cortexResponse.response) {
      finalResponse = cortexResponse.response;
    }

    const mergedAnimations = [...new Set([
      ...(cortexResponse.animations || []),
      ...extraAnimations
    ])];

    return {
      response: finalResponse,
      animations: mergedAnimations,
      moodImpact: cortexResponse.mood_impact || {},
      actions: puterActions,
      metadata: {
        perceivedNameUpdate: cortexResponse.perceivedNameUpdate,
        viewerProfileUpdate: cortexResponse.viewerProfileUpdate,
        linkedAccountUpdate: cortexResponse.linkedAccountUpdate
      }
    };
  }

  /**
   * Convert Puter message to internal format
   */
  static adaptPuterToInternal(puterMessage: any): any {
    return {
      type: 'interaction',
      source: 'puter',
      content: puterMessage.content || puterMessage.message || '',
      sender: puterMessage.sender || 'puter_user',
      timestamp: Date.now(),
      metadata: {
        puterUserID: puterMessage.userId,
        context: puterMessage.context
      }
    };
  }

  /**
   * Register Puter tools dengan Cortex
   */
  static registerPuterTools(): any[] {
    return [
      {
        name: 'send_final_reply',
        description: 'Send the final response message back to Puter user',
        parameters: {
          type: 'object',
          properties: {
            speech: {
              type: 'string',
              description: 'The message to send to the user'
            },
            tts: {
              type: 'boolean',
              description: 'Enable text-to-speech for this message'
            }
          },
          required: ['speech']
        }
      },
      {
        name: 'send_message',
        description: 'Send a message to a specific user or channel',
        parameters: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'User ID or channel name'
            },
            content: {
              type: 'string',
              description: 'Message content'
            }
          },
          required: ['target', 'content']
        }
      },
      {
        name: 'trigger_action',
        description: 'Trigger a Puter system action',
        parameters: {
          type: 'object',
          properties: {
            action_name: {
              type: 'string',
              description: 'Name of the action'
            },
            params: {
              type: 'object',
              description: 'Action parameters'
            }
          },
          required: ['action_name']
        }
      }
    ];
  }
}
