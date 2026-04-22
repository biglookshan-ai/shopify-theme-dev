const getSystemPrompt = (mode) => `
# Role and Persona
You are a Senior Film and Video Equipment Product Description Expert for CineGearPro, powered by MiniMax AI.
You must STRICTLY use pure British English spelling (e.g., "optimised", "colour", "aluminium").

# Objective
Generate a professional, high-end product description for cinematography equipment. 
Mode: ${mode === 'detailed' ? 'DETAILED (Comprehensive & Analytical)' : 'CONCISE (Punchy & Direct)'}

# Structure Rules
${mode === 'detailed' ? `
- Title: Professional product name.
- Overview: An engaging 1-2 sentence hook.
- Sections: 3-4 detailed paragraphs focusing on different functional areas (e.g., Imaging Performance, Ergonomics & Build, Connectivity). 
- Features: 8-12 comprehensive bullet points with technical depth.
` : `
- Title: Professional product name.
- Overview: A concise but powerful single-paragraph summary (30-60 words).
- Sections: Leave as an empty array.
- Features: 5-8 punchy bullet points highlighting key advantages.
`}

# Style Guidelines
- Use MARKDOWN BOLD (**key spec**) for EVERY technical specification (e.g., **Full-frame**, **14 stops dynamic range**, **8K/60p**, **Carbon Fibre**).
- Avoid fluff; focus on performance and professional utility.
- Tone should be authoritative, premium, and sophisticated.

# Output Format
Return ONLY a JSON object:
{
  "title": "string",
  "overview": "string",
  "sections": [
    { "heading": "Heading Name", "content": "Detailed content..." }
  ],
  "features": ["string", "string", ...]
}
`;

// Configuration
const MINIMAX_KEY = import.meta.env.VITE_MINIMAX_API_KEY || "";
const MINIMAX_MODEL = import.meta.env.VITE_MINIMAX_MODEL || "abab6.5-chat";
const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1/chat/completions";

export async function generateDescription(materials, references, files = [], onEngineStatus, mode = 'concise') {
  if (!MINIMAX_KEY) {
    throw new Error("MiniMax API Key is missing. Please check your .env file.");
  }

  if (onEngineStatus) onEngineStatus(`MiniMax Optimized (${mode})`);

  try {
    return await generateWithMiniMax(materials, references, files, mode);
  } catch (error) {
    console.error("MiniMax Engine Error:", error);
    throw new Error(`AI Generation failed: ${error.message}`);
  }
}

async function generateWithMiniMax(materials, references, files, mode) {
  const prompt = getSystemPrompt(mode);
  
  // Construct the message content
  // Note: Handling vision as text description for now if files are present, 
  // until confirmed that the specific abab model supports OpenAI vision payloads.
  let textContent = `Materials: ${materials}\nRefs: ${references}\nGenerate description in ${mode.toUpperCase()} mode. Output only pure JSON.`;
  
  const userContent = [
    { type: "text", text: textContent }
  ];

  // If there are files/images, we attempt to pass them in OpenAI format.
  // MiniMax International (MiniMaxi) usually supports this in their multimodal models.
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
      temperature: 0.1, // High precision for JSON
      max_tokens: 3000
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    // Handle MiniMax specific error codes if available
    const errorMsg = data.base_resp?.status_msg || data.error?.message || "MiniMax Request failed";
    throw new Error(errorMsg);
  }

  let text = data.choices[0].message.content.trim();
  
  // Robust cleaning of markdown code blocks
  text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON from MiniMax:", text);
    // Attempt a secondary clean if there's trailing garbage
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        throw new Error("AI output was not valid JSON format.");
      }
    }
    throw new Error("AI output was not valid JSON. Please try again.");
  }
}
