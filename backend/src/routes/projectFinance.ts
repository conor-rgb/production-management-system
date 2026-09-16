import { readReconciliation } from "../services/projectReconciliation";
import { previewClientInvoice } from "../services/clientBilling";
import { Router, Request, Response, NextFunction } from "express";
import { FinanceError, readFinance, writeFinance, financeSummaries } from "../services/projectFinance";
import { previewFinancePurchaseOrder } from "../services/financePurchaseOrders";
import { invoiceInbox } from "../services/driveInvoiceInbox";
const router = Router();
const route = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
router.get("/", route(async (_req,res) => res.json(await financeSummaries())));
router.get("/:productionId/drive-inbox", route(async (req,res) => res.json(await invoiceInbox(req.params.productionId, typeof req.query.pageToken === "string" ? req.query.pageToken : undefined))));
router.get("/:productionId/purchase-orders/:id/preview", route(async (req,res) => {
  const pdf = await previewFinancePurchaseOrder(req.params.productionId, req.params.id);
  res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", "inline; filename=Draft-PO.pdf"); res.send(pdf);
}));
router.get("/:productionId/client-invoices/:id/preview", route(async(req,res)=>{const pdf=await previewClientInvoice(req.params.productionId,req.params.id);res.type("application/pdf").setHeader("Content-Disposition","inline; filename=Draft-invoice.pdf");res.send(pdf);}));
router.get("/:productionId/reconciliation",route(async(req,res)=>res.json(await readReconciliation(req.params.productionId))));
router.get("/:productionId", route(async (req,res) => res.json(await readFinance(req.params.productionId))));
router.post("/:productionId/actions/:action", route(async (req,res) => {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== "object") throw new FinanceError("Invalid finance request.");
  if (!req.session.userId) throw new FinanceError("Unauthorised", 401);
  res.json(await writeFinance(req.params.productionId, req.session.userId, req.params.action, req.body));
}));
router.use((error: Error & {code?: string}, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof FinanceError) { res.status(error.status).json({ error: error.message }); return; }
  if (error.code === "P2002") { res.status(409).json({ error: "This invoice reference or Drive document already exists. Client invoice references must be unique across projects. Open the existing record instead." }); return; }
  console.error("[FINANCE] Request failed", error.name, error.code || "");
  res.status(500).json({ error: "Could not save project finances. Retry the same request or refresh to check the result." });
});
export default router;
