import { ToolModule } from "../../../include/types";
import manifest from "./manifest.json";

interface GenerateArgs {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  model_id?: string;
  cfg_scale?: number;
  steps?: number;
}

export const TensorArtGenerateTool: ToolModule = {
  metadata: manifest as any,

  execute: async (args: GenerateArgs, context: any) => {
    const { settings = {} } = context;
    
    // Retrieve API key from settings or env
    const apiKey = settings.tensorart?.apiKey || process.env.TENSORART_API_KEY;

    if (!apiKey) {
      throw new Error(
        "TensorArt API key is required but missing. " +
        "Please provide your API key under Settings -> Modules -> TensorArt or add TENSORART_API_KEY to your env variables."
      );
    }

    const prompt = args.prompt;
    const negativePrompt = args.negative_prompt || "nsfw, lowres, bad hands, low quality, worst aesthetic, extra limbs, ugly, duplicate";
    const width = args.width || 512;
    const height = args.height || 512;
    const modelId = args.model_id || "620130983637151123"; // Standard high-quality anime SD model
    const cfgScale = args.cfg_scale || 7;
    const steps = args.steps || 20;

    console.log(`[TENSORART_GENERATE] Handshaking request: prompt="${prompt}" style=${width}x${height}`);

    const payload = {
      request_id: `yui_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stages: [
        {
          type: "INPUT_INITIALIZATION",
          input: {
            width,
            height,
            count: 1
          }
        },
        {
          type: "DIFFUSION",
          diffusion: {
            prompt,
            negativePrompt,
            sdModel: modelId,
            sampler: "Euler a",
            steps,
            cfgScale
          }
        }
      ]
    };

    try {
      // 1. Submit Generation Job
      const submitRes = await fetch("https://tams-api.tensor.art/v1/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        throw new Error(`TensorArt Job Submission failed (${submitRes.status}): ${errorText}`);
      }

      const submitData = await submitRes.json();
      const jobId = submitData.job?.id || submitData.id || (submitData.job && submitData.job.id);

      if (!jobId) {
        throw new Error(`Invalid response format from TensorArt API: No job ID returned.`);
      }

      console.log(`[TENSORART_GENERATE] Job successfully queued with ID: ${jobId}`);

      // 2. Poll progress sequentially with standard timeout (60s)
      let attempts = 0;
      const maxAttempts = 15;
      const pollIntervalMs = 4000;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        attempts++;

        console.log(`[TENSORART_GENERATE] Polling job state (Attempt ${attempts}/${maxAttempts})...`);

        const pollRes = await fetch(`https://tams-api.tensor.art/v1/jobs/${jobId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          }
        });

        if (!pollRes.ok) {
          console.warn(`[TENSORART_GENERATE_WARN] Polling failed on attempt ${attempts}: Status ${pollRes.status}`);
          continue;
        }

        const pollData = await pollRes.json();
        const jobInfo = pollData.job || pollData;
        const status = jobInfo.status;

        if (status === "SUCCESS") {
          const imageUrl = jobInfo.successInfo?.images?.[0]?.url || jobInfo.successInfo?.imageUrl;
          if (!imageUrl) {
            throw new Error("Job completed but no resulting imageUrl was found in the success payload.");
          }

          console.log(`[TENSORART_GENERATE] Generation completed successfully! URL: ${imageUrl}`);
          return {
            status: "success",
            imageUrl,
            jobId,
            prompt,
            metadata: {
              width,
              height,
              steps,
              cfgScale,
              modelId
            }
          };
        } else if (status === "FAILED") {
          throw new Error(`TensorArt generation job failed: ${jobInfo.error || "Unknown Error"}`);
        }
      }

      throw new Error(`TensorArt generation timed out after ${maxAttempts * (pollIntervalMs / 1000)} seconds.`);
    } catch (err: any) {
      console.error("[TENSORART_GENERATE_ERROR] Execution failure:", err);
      return {
        status: "error",
        message: err.message || "Unknown error occurred during real-time TensorArt generation."
      };
    }
  }
};
