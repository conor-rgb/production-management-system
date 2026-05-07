import Anthropic from "@anthropic-ai/sdk";

export interface ParsedReceipt {
  vendor: string | null;
  amount: number | null;
  date: string | null;
  currency: string;
  description: string | null;
  suggestedAicpSection: string | null;
  suggestedAicpSectionName: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string | null;
}

type ReceiptJson = {
  vendor?: unknown;
  amount?: unknown;
  date?: unknown;
  currency?: unknown;
  description?: unknown;
  suggestedAicpSection?: unknown;
  suggestedAicpSectionName?: unknown;
  confidence?: unknown;
  rawText?: unknown;
};

const RECEIPT_ANALYSIS_PROMPT = `Analyse this receipt and extract the following information. Respond with JSON only, no other text.

{
  "vendor": "name of the business or supplier",
  "amount": total amount as a number in the receipt currency (e.g. 45.50),
  "date": "date of the receipt in YYYY-MM-DD format",
  "currency": "three letter currency code e.g. GBP, USD, EUR",
  "description": "brief description of what was purchased",
  "suggestedAicpSection": "the single letter AICP budget section code this expense most likely belongs to",
  "suggestedAicpSectionName": "the name of that AICP section",
  "confidence": "high, medium, or low based on image clarity and data completeness",
  "rawText": "key text extracted from the receipt"
}

AICP sections for reference:
A=Pre-Production & Wrap Labor, B=Shooting Crew Labor, C=Pre-Production Expenses, D=Location & Travel, E=Makeup/Wardrobe/Animals, F=Studio & Stage, G=Art Department Labor, H=Art Department Expenses, I=Equipment, J=Film & Digital Media, K=Miscellaneous, L=Director/Creative Fees, M=Talent Labor, N=Talent Expenses, O=Post Production Labor, P=Editorial & Finishing

If you cannot read a value clearly, use null for that field. Amount should always be the total amount paid. For UK receipts assume GBP unless clearly stated otherwise.`;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function confidenceValue(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function amountToPence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function fallback(rawText: string | null = null): ParsedReceipt {
  return {
    vendor: null,
    amount: null,
    date: null,
    currency: "GBP",
    description: null,
    suggestedAicpSection: null,
    suggestedAicpSectionName: null,
    confidence: "low",
    rawText,
  };
}

function parseReceiptResponse(text: string): ParsedReceipt {
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as ReceiptJson;
    return {
      vendor: cleanText(parsed.vendor),
      amount: amountToPence(parsed.amount),
      date: cleanText(parsed.date),
      currency: cleanText(parsed.currency) ?? "GBP",
      description: cleanText(parsed.description),
      suggestedAicpSection: cleanText(parsed.suggestedAicpSection),
      suggestedAicpSectionName: cleanText(parsed.suggestedAicpSectionName),
      confidence: confidenceValue(parsed.confidence),
      rawText: cleanText(parsed.rawText),
    };
  } catch {
    return fallback(text || null);
  }
}

export async function parseReceiptImage(imageBuffer: Buffer, mimeType: string): Promise<ParsedReceipt> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("API key not configured");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64Image = imageBuffer.toString("base64");

  const response = mimeType === "application/pdf"
    ? await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Image,
            },
          },
          {
            type: "text",
            text: RECEIPT_ANALYSIS_PROMPT,
          },
        ],
      }],
    })
    : await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64Image,
            },
          },
          {
            type: "text",
            text: RECEIPT_ANALYSIS_PROMPT,
          },
        ],
      }],
    });

  const textBlock = response.content.find((item) => item.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  return parseReceiptResponse(text);
}
