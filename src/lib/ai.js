import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `
# Role and Persona
You are a Senior Film and Video Equipment Product Description Writing Expert and Checker. You are highly proficient in professional cinematography equipment terminology, film industry concepts, and technologies. You deeply understand the preferences and habits of industry professionals.
You must STRICTLY use pure British English spelling and formatting (e.g., "optimised", "colour", "aluminium", "centre").

# Workflow Rules
The user will provide inputs, which usually include product information (text, files) and optional reference materials.
Your task is to extract the core data, synthesize the references (if any), translate any non-English inputs internally, and STRICTLY output the final product description in pure JSON format as defined below.

# JSON Output Format
You MUST return a valid JSON object matching this exact structure:
{
  "title": "string",
  "overview": "string",
  "features": ["string", "string", ...]
}

## 1. title
- **Structure**: A single short, accurate line representing the product.
- **Format Constraint**: [Brand Name] [Series Name] [Product Name] [Main Function] [Corresponding Selling Points]

## 2. overview
- **Structure**: Written in paragraph form. Contains markdown formatting.
- **Algorithms for Bolding**: You must strictly analyze the hardware specs. ONLY apply markdown **bold** to the most core, technical parameters (e.g., **T2.9**, **Full Frame**, **PL-RF/L/E/Z**, **10-bit 4:2:2**, **3000 nits**).

## 3. features
- **Structure**: An array of strings representing bullet points. Each 50 to 120 characters.
- Apply the same strict bolding algorithm as the overview.

# General Constraints
- Provide zero conversational filler. DO NOT wrap the JSON in markdown blocks.
- Only output British English text.
`;

// Configuration from Environment Variables
const GEMINI_KEYS = (import.meta.env.VITE_GEMINI_API_KEYS || "").split(",").filter(k => k.trim());
const SILICONFLOW_KEY = import.meta.env.VITE_SILICONFLOW_API_KEY || "";
const SILICONFLOW_MODEL = import.meta.env.VITE_SILICONFLOW_MODEL || "qwen/qwen2-vl-72b-instruct";

// Engine State Management
const EngineState = {
  gemini: {
    isAvailable: true,
    lastTryTime: 0,
    cooldownMs: 60 * 1000, // 1 minute cooldown on failure
    keys: GEMINI_KEYS.map(key => ({ key, lastUsed: 0 })),
    currentIndex: 0
  }
};

/**
 * Main Interface for generating descriptions
 */
export async function generateDescription(materials, references, files = [], onEngineStatus) {
  // Check if we should try Gemini
  const canTryGemini = EngineState.gemini.isAvailable || (Date.now() - EngineState.gemini.lastTryTime > EngineState.gemini.cooldownMs);

  if (canTryGemini && GEMINI_KEYS.length > 0) {
    try {
      if (onEngineStatus) onEngineStatus("Gemini (Primary)");
      console.log("Attempting generation with Gemini...");
      const result = await generateWithGemini(materials, references, files);
      
      // Success - Reset state
      EngineState.gemini.isAvailable = true;
      return result;
    } catch (error) {
      console.warn("Gemini Engine failed. Triggering fallback...", error);
      EngineState.gemini.isAvailable = false;
      EngineState.gemini.lastTryTime = Date.now();
      // Specifically handle 429 Rate Limit
      if (error.message && error.message.includes("429")) {
        console.warn("Gemini Rate Limit hit. Switching engine...");
      }
    }
  }

  // Fallback to SiliconFlow
  if (SILICONFLOW_KEY) {
    try {
      if (onEngineStatus) onEngineStatus("SiliconFlow (Fallback Active)");
      console.log("Attempting generation with SiliconFlow...");
      return await generateWithSiliconFlow(materials, references, files);
    } catch (error) {
      console.error("SiliconFlow Fallback also failed:", error);
      throw new Error(`Both engines failed. Last error: ${error.message}`);
    }
  }

  throw new Error("No available AI engines configured or all engines failed.");
}

async function generateWithGemini(materials, references, files) {
  // Simple Key Index Rotation
  const currentKeyObj = EngineState.gemini.keys[EngineState.gemini.currentIndex];
  EngineState.gemini.currentIndex = (EngineState.gemini.currentIndex + 1) % EngineState.gemini.keys.length;

  const genAI = new GoogleGenerativeAI(currentKeyObj.key);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // Use stable 1.5 Flash for free tier
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" }
  });

  const promptParts = [
    `Product Materials:\n${materials || "See attached files."}\n\nReference Links/Content:\n${references || "None."}`
  ];

  for (const file of files) {
    promptParts.push({ inlineData: { data: file.base64, mimeType: file.mimeType } });
  }

  const result = await model.generateContent(promptParts);
  const response = await result.response;
  return JSON.parse(response.text());
}

async function generateWithSiliconFlow(materials, references, files) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: `Product Materials:\n${materials || "See attached files."}\n\nReference Links/Content:\n${references || "None."}` },
        ...files.map(file => ({
          type: "image_url",
          image_url: { url: `data:${file.mimeType};base64,${file.base64}` }
        }))
      ]
    }
  ];

  const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SILICONFLOW_KEY}`
    },
    body: JSON.stringify({
      model: SILICONFLOW_MODEL,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "SiliconFlow API error");
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}
