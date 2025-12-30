
import { GoogleGenAI, Type } from "@google/genai";
import { IndicatorOutput, OHLCV, ChartZone, AIAnalysis } from "../types";

// Initialize Gemini Client
// We use the safer named parameter initialization as per Google GenAI SDK guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeTradeSetup(
  currentPrice: number,
  indicators: IndicatorOutput,
  zone: ChartZone | undefined,
  trendType: 'LONG' | 'SHORT'
): Promise<AIAnalysis> {
  
  // 1. Construct the Context
  // We feed the AI a snapshot of the math so it doesn't have to calculate, just interpret.
  const technicalContext = {
    price: currentPrice,
    intent: trendType,
    indicators: {
      vwapDistance: indicators.vwap ? ((currentPrice - indicators.vwap) / indicators.vwap) * 100 : 0,
      evwmaRelationship: indicators.evwma ? (currentPrice > indicators.evwma ? "ABOVE" : "BELOW") : "UNKNOWN",
      volumeDelta: indicators.delta,
      godModeOscillator: indicators.godModeValue, // < 30 is oversold, > 70 is overbought
      normalizedVolume: indicators.normVol
    },
    zoneContext: zone ? {
      type: zone.type,
      zonePrice: zone.price,
      distanceFromZone: Math.abs(currentPrice - zone.price)
    } : "NO_NEARBY_ZONE"
  };

  const prompt = `
    You are a Senior Quantitative Trader. Analyze this technical setup for a potential ${trendType} scalp trade.
    
    Technical Data:
    ${JSON.stringify(technicalContext, null, 2)}
    
    Rules:
    1. GodMode < 35 is Bullish (Oversold), > 65 is Bearish (Overbought).
    2. Positive Volume Delta favors Longs, Negative favors Shorts.
    3. We want to buy at Support Zones and Sell at Resistance Zones.
    
    Output a JSON analysis.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Fast model for trading
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            confidenceScore: { type: Type.NUMBER, description: "0-100 score of trade probability" },
            sentiment: { type: Type.STRING, enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
            reasoning: { type: Type.STRING, description: "Concise technical explanation (max 15 words)" },
            riskFactors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of 1-2 key risks" }
          },
          required: ["confidenceScore", "sentiment", "reasoning", "riskFactors"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIAnalysis;
    }
    throw new Error("Empty response");

  } catch (error) {
    console.error("AI Analysis failed:", error);
    return {
      confidenceScore: 0,
      sentiment: 'NEUTRAL',
      reasoning: "AI Service Unavailable",
      riskFactors: ["Connection Error"]
    };
  }
}
