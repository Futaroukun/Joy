import axios from "axios";
import { fileTypeFromBuffer } from "file-type";
import fs from "fs";
import CryptoJS from "crypto-js";

// Mapping Model ID
const ModelMap = {
  nano_banana: 2, // <-- Default Target (Paling Cepat)
  seed_dream: 5,
  flux: 8,       // (Kualitas Tinggi)
  qwen_image: 9
};

export default class AIEditor {
  constructor() {
    this.AES_KEY = "ai-enhancer-web__aes-key";
    this.AES_IV = "aienhancer-aesiv";
    this.HEADERS = {
      "accept": "*/*",
      "content-type": "application/json",
      "Referer": "https://aienhancer.ai",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
    this.POLLING_INTERVAL = 2000;
    this.MAX_POLLING_ATTEMPTS = 120;
    this.CREATED_BY = "Ditzzy";
  }

  // --- ENCRYPTION & HELPER ---
  encrypt(data) {
    const plaintext = typeof data === "string" ? data : JSON.stringify(data);
    return CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Utf8.parse(this.AES_KEY), {
      iv: CryptoJS.enc.Utf8.parse(this.AES_IV),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    }).toString();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- CORE LOGIC ---
  async processImage(image) {
    let img, type;
    if (Buffer.isBuffer(image)) {
      img = image;
      type = await fileTypeFromBuffer(image);
    } else if (typeof image === "string" && fs.existsSync(image)) {
      img = fs.readFileSync(image);
      type = await fileTypeFromBuffer(img);
    } else {
      throw new Error("Invalid image input: must be file path (string) or Buffer");
    }

    if (!type) throw new Error("Could not detect file type");
    return { base64: `data:${type.mime};base64,${img.toString("base64")}`, mime: type.mime };
  }

  async createTask(apiUrl, model, image, config) {
    // [FIX] Validasi ketat agar tidak error 'model cannot be null'
    if (model === undefined || model === null) {
        throw new Error("CRITICAL: Model ID is missing (Null/Undefined)");
    }

    const { base64 } = await this.processImage(image);
    const settings = typeof config === "string" ? config : this.encrypt(config);
    
    const { data } = await axios.post(apiUrl, { model, image: base64, settings }, { headers: this.HEADERS });
    
    if (data.code !== 100000 || !data.data.id) {
        throw new Error(`Task creation failed: ${data.message}`);
    }
    return data.data.id;
  }

  async pollTaskResult(resultUrl, taskId) {
    let attempts = 0;
    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      const { data } = await axios.post(resultUrl, { task_id: taskId }, { headers: this.HEADERS });
      const { status, output, error, input } = data.data;

      if ((status === "succeeded" || status === "success") && output) {
        return { id: taskId, output, input, status };
      }
      if (status === "failed" || status === "fail") {
          throw new Error(`Task failed: ${error || "Unknown error"}`);
      }

      await this.sleep(this.POLLING_INTERVAL);
      attempts++;
    }
    throw new Error(`Task timeout after ${this.MAX_POLLING_ATTEMPTS} attempts`);
  }

  // --- MAIN FEATURE: IMAGE EDITOR ---
  async ImageAIEditor(image, modelName = 'nano_banana', presetConfig) {
    try {
      const apiUrl = "https://aienhancer.ai/api/v1/k/image-enhance/create";
      const resultUrl = "https://aienhancer.ai/api/v1/k/image-enhance/result";
      
      // [FIX] Fallback System: Jika nama model salah/kosong, paksa pakai ID 2 (Nano Banana)
      let modelId = ModelMap[modelName];
      if (!modelId) {
          modelId = 2; // ID Nano Banana
      }

      const taskId = await this.createTask(apiUrl, modelId, image, presetConfig);
      const result = await this.pollTaskResult(resultUrl, taskId);
      
      return { 
          created_by: this.CREATED_BY, 
          results: result 
      };
    } catch (e) {
      throw new Error(`Image Editor Failed: ${e.message}`);
    }
  }

  getAvailableModels() {
    return Object.keys(ModelMap);
  }
}