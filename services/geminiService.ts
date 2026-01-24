
import { GoogleGenAI } from "@google/genai";

export async function getBusinessSummary(data: any) {
  try {
    // Best practice: Use GoogleGenAI without explicit apiKey to automatically use GEMINI_API_KEY env variable
    const ai = new GoogleGenAI({});
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this daily business data and provide 3 key insights or suggestions for improvement: ${JSON.stringify(data)}`,
      config: {
        systemInstruction: "You are a senior business consultant. Provide concise, actionable insights based on POS and financial data."
      }
    });
    // Access .text as a property
    return response.text;
  } catch (error) {
    console.error("AI Insight Error:", error);
    return "Unable to generate insights at this time.";
  }
}
