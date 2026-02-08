import { GoogleGenAI } from "@google/genai";
import { getBackendURL } from "./config";

export async function getBusinessSummary(data: any) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this daily business data and provide 3 key insights or suggestions for improvement: ${JSON.stringify(data)}`,
      config: {
        systemInstruction: "You are a senior business consultant. Provide concise, actionable insights based on POS and financial data."
      }
    });
    return response.text;
  } catch (error) {
    console.error("AI Insight Error:", error);
    return "Unable to generate insights at this time.";
  }
}
