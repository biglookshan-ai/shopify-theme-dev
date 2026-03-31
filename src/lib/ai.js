import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `
# Role and Persona
You are a Senior Film and Video Equipment Product Description Writing Expert and Checker. You are highly proficient in professional cinematography equipment terminology, film industry concepts, and technologies.
You must STRICTLY use pure British English spelling (e.g., "optimised", "colour", "aluminium").

# Workflow Rules
Input includes product information and optional files.
You must extract data and output STRICTLY in JSON format.
DO NOT include any markdown blocks or conversational filler. Return ONLY the JSON object.

# JSON Output Format
{
  "title": "string",
  "overview": "string",
  "features": ["string", "string", ...]
}
`;

// Configuration
const GEMINI_KEYS = (import.meta.env.VITE_GEMINI_API_KEYS || "").split(",").filter(k => k.trim());
const SILICONFLOW_KEY = import.meta.env.VITE_SILICONFLOW_API_KEY || "";
const SILICONFLOW_MODEL = import.meta.env.VITE_SILICONFLOW_MODEL || "qwen/qwen2-vl-72b-instruct";

const EngineState = {
  gemini: {
    isAvailable: true,
    lastTryTime: 0,
    cooldownMs: 40 * 1000,
    keys: GEMINI_KEYS.map(key => ({ key })),
    currentIndex: 0
  }
};

export async function generateDescription(materials, references, files = [], onEngineStatus) {
  const canTryGemini = EngineState.gemini.isAvailable || (Date.now() - EngineState.gemini.lastTryTime > EngineState.gemini.cooldownMs);

  if (canTryGemini && GEMINI_KEYS.length > 0) {
    try {
      if (onEngineStatus) onEngineStatus("Gemini (Primary)");
      return await generateWithGemini(materials, references, files);
    } catch (error) {
      console.warn("Gemini Engine Error:", error);
      EngineState.gemini.isAvailable = false;
      EngineState.gemini.lastTryTime = Date.now();
    }
  }

  if (SILICONFLOW_KEY) {
    try {
      if (onEngineStatus) onEngineStatus("SiliconFlow (Fallback Active)");
      return await generateWithSiliconFlow(materials, references, files);
    } catch (error) {
      console.error("SiliconFlow Error:", error);
      throw new Error(`AI Generation failed. SF Error: ${error.message}`);
    }
  }

  throw new Error("No available AI engines configured.");
}

async function generateWithGemini(materials, references, files) {
  const currentKey = GEMINI_KEYS[EngineState.gemini.currentIndex];
  EngineState.gemini.currentIndex = (EngineState.gemini.currentIndex + 1) % GEMINI_KEYS.length;

  const genAI = new GoogleGenerativeAI(currentKey);
  // Using gemini-1.5-flash as the identifier
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: SYSTEM_PROMPT
  });

  const promptParts = [
    `Context: ${materials || "Identify the product."}\nRefs: ${references || "None."}\nReturn pure JSON.`
  ];

  for (const file of files) {
    promptParts.push({ inlineData: { data: file.base64, mimeType: file.mimeType } });
  }

  const result = await model.generateContent(promptParts);
  const response = await result.response;
  const text = response.text().trim().replace(/```json|```/g, ""); // Manual clean up just in case
  return JSON.parse(text);
}

async function generateWithSiliconFlow(materials, references, files) {
  const userContent = [
    { type: "text", text: `Materials: ${materials}\nRefs: ${references}\nProvide JSON description according to system prompt.` }
  ];

  for (const file of files) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${file.mimeType};base64,${file.base64}` }
    });
  }

  const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SILICONFLOW_KEY}`
    },
    body: JSON.stringify({
      model: SILICONFLOW_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 2048
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "SF Request failed");

  let text = data.choices[0].message.content.trim();
  // Strip markdown if AI insists on adding it
  text = text.replace(/```json|```/g, "");
  return JSON.parse(text);
}
