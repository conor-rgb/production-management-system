import Anthropic from "@anthropic-ai/sdk";
import { CrewItineraryItemType } from "@prisma/client";

export interface ParsedTravelItem {
  type: CrewItineraryItemType;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  startTimezone: string | null;
  endTimezone: string | null;
  origin: string | null;
  destination: string | null;
  provider: string | null;
  bookingReference: string | null;
  address: string | null;
  terminal: string | null;
  platform: string | null;
  gate: string | null;
  flightNumber: string | null;
  trainNumber: string | null;
  seat: string | null;
  coach: string | null;
  baggage: string | null;
  passengerName: string | null;
  roomType: string | null;
  roomNumber: string | null;
  checkInDetails: string | null;
  checkOutDetails: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

export interface ParsedTravelDocument {
  items: ParsedTravelItem[];
  rawText: string | null;
  confidence: "high" | "medium" | "low";
}

type TravelJson = {
  items?: unknown;
  rawText?: unknown;
  confidence?: unknown;
};

const TRAVEL_MODEL = "claude-haiku-4-5-20251001";

const TRAVEL_ANALYSIS_PROMPT = `Analyse this travel booking document carefully. It may be a screenshot, PDF, email export, flight confirmation, train ticket, car booking, hotel transfer, calendar event, or mixed itinerary. Extract every distinct travel/event block and respond with JSON only, no markdown.

{
  "items": [
    {
      "type": "CAR | TRAIN | FLIGHT | HOTEL | EVENT",
      "date": "YYYY-MM-DD departure/check-in/start date or null",
      "endDate": "YYYY-MM-DD arrival/check-out/end date or null",
      "startTime": "HH:mm 24-hour local departure/check-in/start time or null",
      "endTime": "HH:mm 24-hour local arrival/check-out/end time or null",
      "startTimezone": "departure/check-in timezone e.g. Europe/London, BST, GMT+1, or null",
      "endTimezone": "arrival/check-out timezone e.g. Europe/Paris, CEST, GMT+2, or null",
      "origin": "departure airport/station/pickup address, or for hotels the guest/home/start location if visible, or null",
      "destination": "arrival airport/station/dropoff address, hotel name, venue, or event location",
      "provider": "airline, train operator, car company, hotel/property, venue, or organiser",
      "bookingReference": "booking reference, PNR, ticket number, confirmation code, or null",
      "address": "full address if present, or null",
      "terminal": "terminal if present, or null",
      "platform": "platform/coach/seat if present, or null",
      "gate": "gate if present, or null",
      "flightNumber": "flight number e.g. BA304, or null",
      "trainNumber": "train/service number e.g. Eurostar 9024, or null",
      "seat": "seat number if present, or null",
      "coach": "coach/carriage/cabin/class if present, or null",
      "baggage": "baggage allowance or bags purchased if present, or null",
      "passengerName": "passenger/guest name exactly as visible, or null",
      "roomType": "hotel room type or stay/package type if present, or null",
      "roomNumber": "room number if already assigned, or null",
      "checkInDetails": "hotel check-in instructions, access code, early check-in, reception hours, deposit, ID/card requirements, or null",
      "checkOutDetails": "hotel check-out instructions, late checkout, key return, charges, or null",
      "contactName": "booking contact or driver/contact person, or null",
      "contactPhone": "contact phone, or null",
      "contactEmail": "contact email, or null",
      "notes": "concise important details not captured elsewhere: vehicle type, pickup instructions, check-in notes, important restrictions",
      "confidence": "high | medium | low"
    }
  ],
  "rawText": "most important visible text from the document",
  "confidence": "high | medium | low"
}

Rules:
- If the document includes inbound and outbound journeys, return separate items in chronological order.
- If a flight has an outbound leg and return leg, return two FLIGHT items.
- If a train booking has multiple legs on the same journey, return one TRAIN item per materially separate leg when each has its own time/origin/destination.
- If the document is hotel/accommodation, return one HOTEL item for the stay. Use date/startTime for check-in and endDate/endTime for check-out.
- For hotels, destination should be the hotel/property name, address should be the full hotel address, provider should be the hotel/booking platform when clear.
- Prefer local departure date/time for date and startTime.
- Use endTime for arrival time where visible.
- Preserve timezone labels when visible, especially for flights crossing countries.
- Include all operational details useful for the traveller in structured fields first, then remaining details in notes.
- Use IATA airport codes only when the airport name is not visible; otherwise include both if clear.
- Do not invent details. If a field is absent or unreadable, use null.
- If the document is not a travel/event booking, return an empty items array with low confidence.
- Keep notes short but useful for a production manager building a crew travel PDF.`;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function confidenceValue(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function itemType(value: unknown): CrewItineraryItemType {
  return value === "CAR" || value === "TRAIN" || value === "FLIGHT" || value === "HOTEL" || value === "EVENT" ? value : CrewItineraryItemType.EVENT;
}

function dateValue(value: unknown): string | null {
  const text = cleanText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function timeValue(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parsedItems(value: unknown): ParsedTravelItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ParsedTravelItem[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const parsed: ParsedTravelItem = {
      type: itemType(record.type),
      date: dateValue(record.date),
      endDate: dateValue(record.endDate),
      startTime: timeValue(record.startTime),
      endTime: timeValue(record.endTime),
      startTimezone: cleanText(record.startTimezone),
      endTimezone: cleanText(record.endTimezone),
      origin: cleanText(record.origin),
      destination: cleanText(record.destination),
      provider: cleanText(record.provider),
      bookingReference: cleanText(record.bookingReference),
      address: cleanText(record.address),
      terminal: cleanText(record.terminal),
      platform: cleanText(record.platform),
      gate: cleanText(record.gate),
      flightNumber: cleanText(record.flightNumber),
      trainNumber: cleanText(record.trainNumber),
      seat: cleanText(record.seat),
      coach: cleanText(record.coach),
      baggage: cleanText(record.baggage),
      passengerName: cleanText(record.passengerName),
      roomType: cleanText(record.roomType),
      roomNumber: cleanText(record.roomNumber),
      checkInDetails: cleanText(record.checkInDetails),
      checkOutDetails: cleanText(record.checkOutDetails),
      contactName: cleanText(record.contactName),
      contactPhone: cleanText(record.contactPhone),
      contactEmail: cleanText(record.contactEmail),
      notes: cleanText(record.notes),
      confidence: confidenceValue(record.confidence),
    };
    if (!parsed.date && !parsed.startTime && !parsed.origin && !parsed.destination && !parsed.provider && !parsed.bookingReference) return [];
    return [parsed];
  });
}

function parseTravelResponse(text: string): ParsedTravelDocument {
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as TravelJson;
    return {
      items: parsedItems(parsed.items),
      rawText: cleanText(parsed.rawText),
      confidence: confidenceValue(parsed.confidence),
    };
  } catch {
    return { items: [], rawText: cleanText(text), confidence: "low" };
  }
}

export async function parseTravelItineraryDocument(buffer: Buffer, mimeType: string): Promise<ParsedTravelDocument> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("API key not configured");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = buffer.toString("base64");
  const response = mimeType === "application/pdf"
    ? await client.messages.create({
      model: TRAVEL_MODEL,
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: TRAVEL_ANALYSIS_PROMPT },
        ],
      }],
    })
    : await client.messages.create({
      model: TRAVEL_MODEL,
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64,
            },
          },
          { type: "text", text: TRAVEL_ANALYSIS_PROMPT },
        ],
      }],
    });

  const textBlock = response.content.find((item) => item.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  return parseTravelResponse(text);
}
