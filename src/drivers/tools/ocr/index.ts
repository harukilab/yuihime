import { ToolModule } from '@shared/include/types';
import fs from 'fs';
import manifest from './manifest.json';
import tesseract from 'tesseract.js';

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
