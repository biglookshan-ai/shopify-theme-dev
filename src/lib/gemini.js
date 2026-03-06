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
- **Examples**: 
  - "DZOFILM CATTA ACE 70-135mm T2.9 Full Frame Cine Zoom Lens PL&EF Interchangeable Mount"
  - "MOFAGE POCO Drop-in Filter Adapter Standard Kit PL-RF/L/E/Z"
  - "TILTA ES-T28 Fujifilm GFX ETERNA 55 Cage System"

## 2. overview
- **Structure**: Written in paragraph form. Contains markdown formatting.
- **Content**: Transform the equipment's pain points into compelling selling points. Maintain a professional, objective, yet highly appealing marketing tone.
- **Algorithms for Bolding**: You must strictly analyze the hardware specs. ONLY apply markdown **bold** to the most core, critically relevant technical parameters/selling points that differentiate this specific product (e.g., **T2.9**, **Full Frame**, **PL-RF/L/E/Z**, **10-bit 4:2:2**, **3000 nits**). ABSOLUTELY DO NOT bold generic nouns, verbs, subjective adjectives, or marketing filler (e.g., do not bold "high quality", "professional", "stunning").

## 3. features
- **Structure**: An array of strings representing bullet points. Contains markdown formatting.
- **Content**: Each array item corresponds to exactly one specific selling point/feature.
- **Length Constraint**: Each string item MUST be strictly a single sentence between 50 to 120 English characters in length. This is a critical count.
- Apply the same strict bolding algorithm as the overview.

# General Constraints
- Provide zero conversational filler. DO NOT wrap the JSON in \`\`\`json markdown blocks, just return the raw JSON object.
- Only output British English text inside the JSON values.
`;

export async function generateDescription(apiKey, materials, references, files = []) {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  if (!materials && files.length === 0) {
    throw new Error("Product materials or files are required.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Recommend using the gemini-2.5-flash model for general text tasks and multimodal
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const promptParts = [
    `Product Materials:\n${materials || "See attached files."}\n\nReference Links/Content (Optional):\n${references || "None provided."}`
  ];

  // Append base64 files to the prompt parts
  for (const file of files) {
    promptParts.push({
      inlineData: {
        data: file.base64,
        mimeType: file.mimeType
      }
    });
  }

  try {
    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const text = response.text();
    // Parse the API's JSON output back to an object so the frontend can use it directly
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);

    let errorMessage = error.message || "Failed to generate description. Please check your API key and try again.";

    // Specifically handle the common "Failed to fetch" error caused by GFW/Network issues
    if (errorMessage.includes("Failed to fetch") || String(error).includes("Failed to fetch")) {
      errorMessage = "Network Error: Failed to connect to Google's API (Failed to fetch). If you are in a region where Google services are restricted (like Mainland China), please ensure your system proxy/VPN is active and fully routing traffic for your browser, or your API Key might be invalid.";
    }

    throw new Error(errorMessage);
  }
}
