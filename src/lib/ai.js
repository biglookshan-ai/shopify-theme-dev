const getSystemPrompt = (mode, customInstructions, history = []) => {
  // Extract style from history (last 5 saved items)
  const styleReferences = history
    .filter(h => h.versions && h.versions.length > 0)
    .slice(0, 5)
    .map(h => `Product: ${h.productName}\nStyle Example: ${h.versions[0].result.overview}`)
    .join('\n\n');

  return `
# Role and Persona
You are a Senior Film and Video Equipment Product Description Expert for CineGearPro.
You must STRICTLY use pure British English spelling (e.g., "optimised", "colour", "aluminium").

# ABSOLUTELY NO CHINESE
You are forbidden from using any Chinese characters. Even if the input is in Chinese, the output must be 100% professional English. Failure to comply is a system error.

# Style Learning (Reference your previous successful work)
${styleReferences ? `Study these examples of your best writing style:\n${styleReferences}` : 'Write in a professional, authoritative, and cinematic tone.'}

# Objective
Generate a professional product description.
Mode: ${mode === 'detailed' ? 'DETAILED (Comprehensive & Analytical)' : 'CONCISE (Punchy & Direct)'}

# Structure Rules
${mode === 'detailed' ? `
- Title: Professional product name.
- Overview: Engaging hook paragraphs.
- Sections: Detailed paragraphs (Imaging, Build, etc.). 
- Features: 8-12 comprehensive bullet points.
` : `
- Title: Product name.
- Overview: 1-2 powerful paragraphs ONLY. No subheadings or "Overview" label.
- Sections: Leave as an empty array [].
- Features: 5-8 punchy bullet points.
`}

# Custom User Instructions
${customInstructions ? `IMPORTANT: Follow these specific user requests:\n${customInstructions}` : 'No additional user instructions.'}

# CRITICAL: INTELLIGENT BOLDING (MANDATORY)
You MUST identify and bold (**key technical parameters**), (**high-value selling points**), and (**material specifications**) within ALL text.
- **Narrative Example**: The Arri Alexa 35 features a **revolutionary 4.6K Super 35 sensor** providing **17 stops of dynamic range** and a **Native ISO 800** for superior low-light performance.
- **Feature Example**: **Full-frame 8K sensor** supporting **60fps RAW internal recording**.
- **Rule**: Every paragraph MUST contain 2-4 bolded terms. Every feature bullet MUST start with or contain at least one bolded term.
- **Override**: Even if your provided "History Style Examples" do not have bolding, you MUST apply this bolding rule to all current outputs.

# Style Guidelines
- **BOLDING**: Use double asterisks (**text**) for all bolding in all fields.
- **SPACING**: Use \\n\\n for paragraph breaks.
- Tone: Authoritative, premium, sophisticated cinematography expert.

# Output Format (STRICT JSON)
{
  "title": "string",
  "overview": "string",
  "sections": [{"heading": "string", "content": "string"}],
  "features": ["string"]
}
`;
};

// Configuration
const MINIMAX_KEY = import.meta.env.VITE_MINIMAX_API_KEY || "";
const MINIMAX_MODEL = import.meta.env.VITE_MINIMAX_MODEL || "MiniMax-M2.7-highspeed";
const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1/chat/completions";

/**
 * Helper to extract and prepare link context
 * Note: Real-world scraping should ideally happen via a proxy or extension background script
 */
const prepareLinkContext = async (references) => {
  if (!references) return "";
  const urls = references.match(/https?:\/\/[^\s]+/g) || [];
  if (urls.length === 0) return "";

  let context = "\n### Reference Content from Links:\n";
  // For now, we note the links for the AI. In a real extension, 
  // the background script would have pre-scraped these.
  for (const url of urls.slice(0, 3)) {
    context += `- Reference URL: ${url}\n`;
  }
  return context;
};

export async function generateDescription(materials, references, files = [], onEngineStatus, mode = 'concise', customInstructions = '', history = []) {
  if (!MINIMAX_KEY) {
    throw new Error("MiniMax API Key is missing.");
  }

  if (onEngineStatus) onEngineStatus(`Synthesizing (${mode})...`);

  try {
    const linkContext = await prepareLinkContext(references + ' ' + customInstructions);
    const combinedMaterials = `${materials}${linkContext}`;
    
    return await generateWithMiniMax(combinedMaterials, references, files, mode, customInstructions, history);
  } catch (error) {
    console.error("MiniMax Engine Error:", error);
    throw new Error(`AI Generation failed: ${error.message}`);
  }
}

async function generateWithMiniMax(materials, references, files, mode, customInstructions, history) {
  const prompt = getSystemPrompt(mode, customInstructions, history);
  
  let textContent = `Source Materials:\n${materials}\n\nReferences:\n${references}\n\nTask: Generate ${mode} description. JSON ONLY.`;
  
  const userContent = [{ type: "text", text: textContent }];

  for (const file of files) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${file.mimeType};base64,${file.base64}` }
    });
  }

  const response = await fetch(MINIMAX_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MINIMAX_KEY}`
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.05, // Extremely low temperature for strict compliance
      max_tokens: 3000
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "MiniMax Request failed");
  }

  let text = data.choices[0].message.content.trim();
  
  // Robust JSON extraction
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI failed to return valid JSON.");

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Ensure sections is an array even in concise mode
    if (!parsed.sections) parsed.sections = [];
    return parsed;
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    throw new Error("AI output format error. Please try again.");
  }
}

/**
 * Translates a generated result into Professional Chinese
 */
export async function translateResultToZH(resultJson, onEngineStatus) {
  if (!MINIMAX_KEY) throw new Error("MiniMax API Key is missing.");
  if (onEngineStatus) onEngineStatus("Translating to ZH...");

  const systemPrompt = `
# Role
You are a professional Translator specializing in Cinema, Video, and Photography equipment.

# Task
Translate the provided technical product description from English into Professional Simplified Chinese.

# Rules
- Use accurate technical terms used in the film industry.
- Maintain the EXACT SAME JSON structure.
- TRANSLATE the content of "title", "overview", and the "heading" & "content" inside "sections", and each string in "features".
- Maintain all Markdown bolding (**text**) precisely as they appear in the original.
- Do NOT add any conversational text. ONLY output the JSON.

# Output Format (JSON)
{
  "title": "...",
  "overview": "...",
  "sections": [{"heading": "...", "content": "..."}],
  "features": ["..."]
}
`;

  const userContent = `Original English Content (JSON):\n${JSON.stringify(resultJson, null, 2)}\n\nTranslate to Simplified Chinese. JSON ONLY.`;

  try {
    const response = await fetch(MINIMAX_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MINIMAX_KEY}`
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 3000
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Translation failed");

    let text = data.choices[0].message.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI failed to return valid JSON translation.");
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Translation Error:", error);
    throw new Error(`Translation failed: ${error.message}`);
  }
}
