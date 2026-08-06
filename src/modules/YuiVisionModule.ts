import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { SettingsManager } from '../core/kernel/settings';
import { toSingleString } from '@/core/kernel/configNormalizer';

/**
 * YuiVisionModule
 * 
 * Standalone cognitive vision module (self-contained/separate) for processing
 * image input with very minimal token consumption (low-token optimization).
 * Reduces the binary sensor context size into a compact textual description (< 50 tokens).
 * Designed to be UNIVERSAL without being locked to a single provider (Gemini, OpenAI, OpenRouter, Anthropic, Custom).
 */
export const YuiVisionModule: CortexModule = {
  metadata: {
    id: 'vision',
    name: 'yui-vision: Optical Frame Analysis',
    description: 'Token-friendly vision processing module that compresses images into a universal comparative text description.',
    version: '1.2.0',
    type: ModuleType.CORTEX,
    order: 11,
    phase: 'aggregation',
    settingsTab: 'Modules',
    configSchema: {
      fields: {
        enabled: { 
          type: 'boolean', 
          label: 'Enable Vision Module Processing', 
          default: true,
          description: 'Enables image analysis from Telegram or Discord attachments, or viewport snapshots.'
        },
        provider: {
          type: 'select',
          label: 'Vision Provider Engine',
          default: 'gemini',
          options: [
            { label: 'Google Gemini (Official / Proxy)', value: 'gemini' },
            { label: 'OpenAI (Official Compatible)', value: 'openai' },
            { label: 'OpenRouter (Multi-model Engine)', value: 'openrouter' },
            { label: 'Anthropic Claude (Official API)', value: 'anthropic' },
            { label: 'Custom Vision API Gateway', value: 'custom' }
          ],
          description: 'AI vision service provider used to analyze uploaded media payloads.'
        },
        preferredModel: {
          type: 'string',
          label: 'Preferred Vision Model',
          default: 'gemini-3.5-flash',
          description: 'Vision model name to call. Examples: gemini-3.5-flash, gpt-4o-mini, claude-3-5-sonnet-latest, or llava.'
        },
        customUrl: {
          type: 'string',
          label: 'Custom API Endpoint URL',
          default: '',
          description: 'Only when "Custom Vision API Gateway" is selected. Enter your full (v1) base endpoint URL.'
        },
        customKey: {
          type: 'password',
          label: 'Custom API Token Key',
          default: '',
          description: 'Only when "Custom Vision API Gateway" is selected. Secret API key for authorization.'
        },
        lowTokenMode: { 
          type: 'boolean', 
          label: 'Low Token Optimization', 
          default: true,
          description: 'Forces the AI to produce very short, dense descriptions to save inner memory tokens.'
        },
        maxWords: { 
          type: 'slider', 
          label: 'Word Describe Limit', 
          min: 10, 
          max: 100, 
          step: 5, 
          default: 20,
          description: 'Maximum number of words for the generated image description.'
        },
        describeFace: { 
          type: 'boolean', 
          label: 'Facial Expression Analysis', 
          default: false,
          description: 'Attempts to specifically detect facial emotion, age, and gender if people are present in the image.'
        },
        customVisionPrompt: {
          type: 'textarea',
          label: 'Custom Vision Instructions',
          default: 'Analyze this image and describe it in a brief, highly concise sentence or two. Focus on identifying the main subjects, elements, text, colors, characters, and environment. Keep it compact, descriptive, and low-token. Respond using standard descriptive language, no filler.',
          description: 'Custom instructions sent to the vision model when processing image objects.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    // In the normal cognitive loop, if there is no new image context, bypass safely
    return { ...context };
  }
};

/**
 * Analyzes the image buffer online using various flexibly and universally configured AI providers.
 * Produces a short visual text description to save Yui's long-term memory token accumulation.
 */
export async function describeImageFromBuffer(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    const settings = SettingsManager.getInstance();
    const visionSettings = settings.get("vision") || {};
    
    // Check if the vision module itself is disabled in config
    if (visionSettings.enabled === false) {
      console.log("[YUI_VISION] Vision module is disabled in settings. Skipping.");
      return null;
    }

    const provider = visionSettings.provider || "gemini";
    const base64Data = buffer.toString("base64");

    // Build a dynamic prompt based on the lowTokenMode, maxWords, describeFace, etc. settings.
    let basePrompt = visionSettings.customVisionPrompt || "Analyze this image and describe it in a brief, highly concise sentence or two. Focus on identifying the main subjects, elements, text, colors, characters, and environment. Keep it compact, descriptive, and low-token. Respond using standard descriptive language, no filler.";
    
    if (visionSettings.lowTokenMode !== false) {
      const wordLimit = visionSettings.maxWords || 20;
      basePrompt += ` Output MUST be strictly under ${wordLimit} words. Highly condensed and atomic sentence structure only.`;
    }

    if (visionSettings.describeFace) {
      basePrompt += " Please specifically pay attention to facial expressions, mood, perceived emotions, and visible expressions if humans or anime characters are present.";
    }

    let resultText = "";

    // Execution block based on structural provider patterns
    if (provider === "gemini") {
      const geminiSettings = settings.get("gemini") || {};
      const apiKey = settings.getApiKey() || geminiSettings.apiKey;
      if (!apiKey) {
        console.warn("[YUI_VISION] Gemini API Key is missing. Skipping analysis.");
        return null;
      }

      const defaultModel = "gemini-3.5-flash";
      const rawTargetModel = visionSettings.preferredModel || geminiSettings.model || defaultModel;
      const targetModel = Array.isArray(rawTargetModel) ? (rawTargetModel[0] || defaultModel) : rawTargetModel;
      const cleanModel = targetModel.replace(/^models\//, "");

      const finalBaseUrl = (geminiSettings.baseUrl || geminiSettings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
      const apiVersion = geminiSettings.apiVersion || 'v1beta';

      let targetUrl = '';
      if (finalBaseUrl.includes('/models/') || finalBaseUrl.includes(':generateContent')) {
        targetUrl = finalBaseUrl;
      } else {
        targetUrl = `${finalBaseUrl}/${apiVersion}/models/${cleanModel}:generateContent?key=${apiKey}`;
      }

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: basePrompt },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              }
            ]
          }
        ]
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'aistudio-build'
      };

      if (geminiSettings.useHeaderApiKey || finalBaseUrl.includes('api.openai.com') || finalBaseUrl.includes('openrouter.ai')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['x-goog-api-key'] = apiKey;
      }

      const visionController = new AbortController();
      const visionTimeout = setTimeout(() => visionController.abort(), 45000);
      let fetchRes: Response;
      try {
        fetchRes = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: visionController.signal
        });
      } finally {
        clearTimeout(visionTimeout);
      }

      if (!fetchRes.ok) {
        const errText = await fetchRes.text();
        console.error(`[YUI_VISION] Google API returned error: ${errText}`);
        return null;
      }

      const resJson: any = await fetchRes.json();
      const parts = resJson.candidates?.[0]?.content?.parts || [];
      const mainPart = parts.find((p: any) => p.text && !p.thought);
      if (mainPart) {
        resultText = mainPart.text;
      } else {
        resultText = parts.map((p: any) => p.text || '').join('').trim();
      }

    } else if (provider === "openai" || provider === "openrouter" || provider === "custom") {
      let baseUrl = "https://api.openai.com/v1";
      let apiKey = "";
      let defaultModel = "gpt-4o-mini";
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'aistudio-build'
      };

      if (provider === "openai") {
        const openaiSettings = settings.get("openai") || {};
        baseUrl = openaiSettings.baseUrl || "https://api.openai.com/v1";
        apiKey = toSingleString(openaiSettings.apiKey);
        defaultModel = toSingleString(openaiSettings.model) || "gpt-4o-mini";
      } else if (provider === "openrouter") {
        const openrouterSettings = settings.get("openrouter") || {};
        baseUrl = openrouterSettings.baseUrl || "https://openrouter.ai/api/v1";
        apiKey = toSingleString(openrouterSettings.apiKey);
        defaultModel = toSingleString(openrouterSettings.model) || "google/gemini-flash-1.5";
        headers['HTTP-Referer'] = 'https://aistudio.build';
        headers['X-Title'] = 'YuiHime Vision';
      } else {
        // Custom gateway fallback
        baseUrl = visionSettings.customUrl || "";
        apiKey = visionSettings.customKey || "";
        defaultModel = "llava";
      }

      if (!baseUrl) {
        console.warn("[YUI_VISION] Custom base URL is missing. Skipping analysis.");
        return null;
      }

      const cleanBase = baseUrl.replace(/\/$/, "");
      const targetUrl = `${cleanBase}/chat/completions`;
      const targetModel = visionSettings.preferredModel || defaultModel;

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const requestBody = {
        model: targetModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: basePrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ]
      };

      const visionController = new AbortController();
      const visionTimeout = setTimeout(() => visionController.abort(), 45000);
      let fetchRes: Response;
      try {
        fetchRes = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: visionController.signal
        });
      } finally {
        clearTimeout(visionTimeout);
      }

      if (!fetchRes.ok) {
        const errText = await fetchRes.text();
        console.error(`[YUI_VISION] OpenAI-Compatible connection returned error (${fetchRes.status}): ${errText}`);
        return null;
      }

      const resJson: any = await fetchRes.json();
      resultText = resJson.choices?.[0]?.message?.content || "";

    } else if (provider === "anthropic") {
      const anthropicSettings = settings.get("anthropic") || {};
      const baseUrl = anthropicSettings.baseUrl || "https://api.anthropic.com/v1";
      const apiKey = anthropicSettings.apiKey || "";
      const defaultModel = "claude-3-5-sonnet-latest";

      if (!apiKey) {
        console.warn("[YUI_VISION] Anthropic API Key is missing. Skipping analysis.");
        return null;
      }

      const cleanBase = baseUrl.replace(/\/$/, "");
      const targetUrl = `${cleanBase}/messages`;
      const targetModel = visionSettings.preferredModel || defaultModel;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'aistudio-build'
      };

      const requestBody = {
        model: targetModel,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64Data
                }
              },
              {
                type: "text",
                text: basePrompt
              }
            ]
          }
        ]
      };

      const visionController = new AbortController();
      const visionTimeout = setTimeout(() => visionController.abort(), 45000);
      let fetchRes: Response;
      try {
        fetchRes = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: visionController.signal
        });
      } finally {
        clearTimeout(visionTimeout);
      }

      if (!fetchRes.ok) {
        const errText = await fetchRes.text();
        console.error(`[YUI_VISION] Anthropic API returned error (${fetchRes.status}): ${errText}`);
        return null;
      }

      const resJson: any = await fetchRes.json();
      resultText = resJson.content?.[0]?.text || "";
    }

    return resultText.trim() || null;
  } catch (error: any) {
    console.error("[YUI_VISION] Universal vision analysis failed:", error.message || error);
    return null;
  }
}
