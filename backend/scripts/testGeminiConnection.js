require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

async function testGeminiConnection() {
  if (!apiKey) {
    console.error("Gemini test stopped: GEMINI_API_KEY is missing from backend/.env.");
    console.error("Add GEMINI_API_KEY=your_key_here, then run npm run gemini:test again.");
    process.exitCode = 1;
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: "Reply with exactly: BloomBox Gemini connection verified."
    });

    console.log(`Gemini connection successful using model: ${model}`);
    console.log(`Model response: ${response.text || "(no text returned)"}`);
  } catch (error) {
    const status = error?.status || error?.code || "unknown";
    const message = error?.message || "Unknown Gemini API error.";
    console.error(`Gemini connection failed (status: ${status}).`);
    console.error(message);
    console.error("Check the API key, selected model, quota, and Google AI Studio project settings.");
    process.exitCode = 1;
  }
}

testGeminiConnection();
