import { ToolModule } from '@shared/include/types';
import fs from 'fs';
import tesseract from 'tesseract.js';

const manifest = {
  "id": "ocr",
  "name": "OCR (Text Extraction)",
  "description": "Extract readable text from a local image file. Use this when the user uploads or references an image and wants Yui to read, transcribe, or explain the text content inside it.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 97,
  "parameters": {
    "type": "object",
    "properties": {
      "imagePath": {
        "type": "string",
        "description": "Absolute path to the image file to run OCR on."
      },
      "lang": {
        "type": "string",
        "description": "Optional language code (e.g. 'eng' for English, 'ind' for Indonesian). Defaults to 'eng'."
      }
    },
    "required": ["imagePath"]
  }
} as const;

export const OCRTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const { imagePath, lang = 'eng' } = args;

    if (!imagePath) {
      return { success: false, error: "Missing required parameter 'imagePath'." };
    }

    if (!fs.existsSync(imagePath)) {
      return { success: false, error: `Image file not found at path: '${imagePath}'.` };
    }

    try {
      const recognize = tesseract.recognize || (tesseract as any).default?.recognize;

      if (typeof recognize !== 'function') {
        throw new Error("Failed to load tesseract.js recognize function.");
      }

      const { data: { text } } = await recognize(
        imagePath,
        lang
      );

      return {
        success: true,
        text: text.trim(),
        length: text.trim().length,
        language: lang
      };
    } catch (err: any) {
      return {
        success: false,
        error: `OCR execution failed: ${err.message || String(err)}`
      };
    }
  }
};
