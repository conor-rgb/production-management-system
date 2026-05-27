import Anthropic from "@anthropic-ai/sdk";

export interface ParsedReceipt {
  vendor: string | null;
  invoiceNumber: string | null;
  amountGross: number | null;
  amountNet: number | null;
  vatAmount: number | null;
  vatRate: number | null;
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
  invoiceNumber?: unknown;
  amountGross?: unknown;
  amountNet?: unknown;
  vatAmount?: unknown;
  vatRate?: unknown;
  date?: unknown;
  currency?: unknown;
  description?: unknown;
  suggestedAicpSection?: unknown;
  suggestedAicpSectionName?: unknown;
  confidence?: unknown;
  rawText?: unknown;
};

const RECEIPT_MODEL = "claude-haiku-4-5-20251001";

const RECEIPT_ANALYSIS_PROMPT = `Analyse this document carefully. It may be a receipt, invoice, supplier bill, or expense document. Extract the following information and respond with JSON only, no other text, no markdown.

{
  "vendor": "the name of the supplier, business, or company issuing this document — look for company name, 'From:', letterhead, or logo text",
  "invoiceNumber": "the invoice number, bill number, receipt number, or document reference if present",
  "amountGross": the total amount INCLUDING VAT as a number (what was actually paid),
  "amountNet": the total amount EXCLUDING VAT as a number (the net cost before VAT),
  "vatAmount": the VAT amount as a number,
  "vatRate": the VAT rate as a percentage number e.g. 20,
  "date": "the invoice date, receipt date, or document date in YYYY-MM-DD format",
  "currency": "three letter currency code e.g. GBP, USD, EUR — default to GBP if unclear",
  "description": "brief description of what was purchased or the nature of the expense — look at line items or description fields",
  "suggestedAicpSection": "single letter AICP section code this expense most likely belongs to based on the description",
  "suggestedAicpSectionName": "name of that AICP section",
  "confidence": "high if all key fields are clearly readable, medium if some fields needed inference, low if image is unclear or key fields are missing",
  "rawText": "the most important text extracted — vendor name, total amount, date as they appear in the document"
}

AICP sections: A=Pre-Production & Wrap Labor, B=Shooting Crew Labor, C=Pre-Production Expenses, D=Location & Travel, E=Makeup/Wardrobe/Animals, F=Studio & Stage, G=Art Department Labor, H=Art Department Expenses, I=Equipment, J=Film & Digital Media, K=Miscellaneous, L=Director/Creative Fees, M=Talent Labor, N=Talent Expenses, O=Post Production Labor, P=Editorial & Finishing

Important rules:
- This may be a multi-page document — check ALL pages before deciding on the total amount
- For invoices: the total is usually on the last page or in a summary box
- For receipts: the total is usually at the bottom
- If you can see a VAT breakdown: use the total INCLUSIVE of VAT (the amount actually paid)
- If the document is from unlimited.bond or BOND UN LIMITED: this is likely a client invoice being reviewed, not a supplier receipt — still extract the total and date
- Always try to extract both net and gross amounts separately
- The net amount (ex-VAT) is the PRIMARY amount for budget purposes
- If only one total is shown with no VAT breakdown: use it as amountGross and set amountNet and vatAmount to null
- UK standard VAT rate is 20% — if VAT is mentioned but no breakdown shown, you may calculate: net = gross / 1.20
- Some suppliers are not VAT registered — in that case amountGross = amountNet and vatAmount = 0
- If a field is genuinely not present or unreadable: use null
- Amount must always be a plain number, never a string`;

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

function percentageValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const percentage = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(percentage) ? percentage : null;
}

function fallback(rawText: string | null = null): ParsedReceipt {
  return {
    vendor: null,
    invoiceNumber: null,
    amountGross: null,
    amountNet: null,
    vatAmount: null,
    vatRate: null,
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
      invoiceNumber: cleanText(parsed.invoiceNumber),
      amountGross: amountToPence(parsed.amountGross),
      amountNet: amountToPence(parsed.amountNet),
      vatAmount: amountToPence(parsed.vatAmount),
      vatRate: percentageValue(parsed.vatRate),
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
      model: RECEIPT_MODEL,
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
      model: RECEIPT_MODEL,
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
  console.log("[RECEIPT] Raw Claude response:", text.substring(0, 500));
  return parseReceiptResponse(text);
}
