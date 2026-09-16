import type { Response } from "express";

type SelectsEvent = {
  type: "annotation_created" | "annotation_updated" | "annotation_deleted";
  productionId: string;
  imageId?: string | null;
  annotationId?: string | null;
};

type Client = {
  id: string;
  productionId: string;
  res: Response;
};

const clients = new Map<string, Client>();

export function addSelectsRealtimeClient(productionId: string, res: Response) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ productionId })}\n\n`);
  clients.set(id, { id, productionId, res });
  const heartbeat = setInterval(() => {
    if (!clients.has(id)) return;
    res.write(`event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  }, 25_000);
  res.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(id);
  });
}

export function broadcastSelectsEvent(event: SelectsEvent) {
  const payload = JSON.stringify(event);
  for (const client of clients.values()) {
    if (client.productionId !== event.productionId) continue;
    client.res.write(`event: selects-update\ndata: ${payload}\n\n`);
  }
}
