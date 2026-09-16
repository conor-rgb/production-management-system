import express, { Router, Request, Response } from "express";
import { BlackbookCategory, BlackbookEntryType, BlackbookLifecycleStatus } from "@prisma/client";
import prisma from "../prisma";
import { createPurchaseOrderEmailDraft } from "../services/purchaseOrderPdf";
import { boundedString, isPublicToken, requiredEmail } from "../utils/validation";

const router = Router();

router.use(express.urlencoded({ extended: false }));

function escapeHtml(value: string | null | undefined): string {
  return (value ?? "").replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[char] ?? char));
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f5f5f1; }
    body { margin: 0; min-height: 100vh; }
    main { max-width: 760px; margin: 0 auto; padding: 34px 18px 52px; }
    .brand { font-size: 22px; font-weight: 750; letter-spacing: 0; margin-bottom: 28px; }
    .panel { background: #fff; border: 1px solid #e2e2dc; border-radius: 8px; padding: 22px; box-shadow: 0 20px 50px rgba(20,20,20,.06); }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    p { color: #565656; line-height: 1.55; }
    .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    .meta div { border: 1px solid #ededeb; border-radius: 7px; padding: 10px; font-size: 12px; color: #666; }
    .meta strong { display: block; margin-top: 4px; color: #171717; font-size: 13px; }
    form { display: grid; gap: 14px; margin-top: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 6px; font-size: 12px; font-weight: 650; color: #555; }
    input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #deded8; border-radius: 7px; padding: 10px 11px; font: inherit; font-size: 14px; color: #171717; background: #fff; }
    textarea { min-height: 86px; resize: vertical; }
    button { min-height: 42px; border: 0; border-radius: 7px; background: #171717; color: #fff; padding: 0 16px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .note { margin-top: 14px; font-size: 12px; color: #777; }
    @media (max-width: 640px) { .grid, .meta { grid-template-columns: 1fr; } .panel { padding: 18px; } }
  </style>
</head>
<body>
  <main>
    <div class="brand">unlimited.bond</div>
    <section class="panel">${body}</section>
  </main>
</body>
</html>`;
}

function text(value: unknown): string {
  return boundedString(value, 500);
}

async function loadPo(token: string) {
  return prisma.purchaseOrderGroup.findUnique({
    where: { onboardingToken: token },
    include: {
      production: true,
      blackbookEntry: true,
      allocations: true,
    },
  });
}

router.get("/:token", async (req: Request, res: Response): Promise<void> => {
  if (!isPublicToken(req.params.token)) {
    res.status(400).send(page("Supplier onboarding", "<h1>Invalid link</h1><p>This supplier onboarding link is not valid.</p>"));
    return;
  }
  const po = await loadPo(req.params.token);
  if (!po) {
    res.status(404).send(page("Supplier onboarding", "<h1>Link not found</h1><p>This supplier onboarding link is no longer available.</p>"));
    return;
  }
  if (po.onboardingCompletedAt) {
    res.send(page("Supplier onboarding complete", "<h1>Details already submitted</h1><p>Thanks, your supplier details have already been received.</p>"));
    return;
  }
  if (po.onboardingExpiresAt && po.onboardingExpiresAt < new Date()) {
    res.status(410).send(page("Supplier onboarding expired", "<h1>Link expired</h1><p>Please ask unlimited.bond for a fresh onboarding link.</p>"));
    return;
  }

  const total = po.allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  res.send(page("Supplier onboarding", `
    <h1>Supplier onboarding</h1>
    <p>Please confirm your supplier details so we can add you to the unlimited.bond Blackbook and issue your purchase order.</p>
    <div class="meta">
      <div>Supplier<strong>${escapeHtml(po.supplierName)}</strong></div>
      <div>PO<strong>${escapeHtml(po.poNumber)}</strong></div>
      <div>Amount<strong>£${total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
    </div>
    <form method="post">
      <div class="grid">
        <label>Supplier / company name <input name="displayName" required value="${escapeHtml(po.blackbookEntry?.displayName ?? po.supplierName)}"></label>
        <label>Email <input type="email" name="email" required value="${escapeHtml(po.supplierEmail ?? po.blackbookEntry?.email)}"></label>
        <label>Phone <input name="phone" value="${escapeHtml(po.supplierPhone ?? po.blackbookEntry?.phone)}"></label>
        <label>Website <input name="website" value="${escapeHtml(po.blackbookEntry?.website)}"></label>
      </div>
      <div class="grid">
        <label>Billing email <input type="email" name="billingEmail" required value="${escapeHtml(po.blackbookEntry?.supplierBillingEmail ?? po.supplierEmail ?? po.blackbookEntry?.email)}"></label>
        <label>VAT / tax number <input name="taxNumber" required value="${escapeHtml(po.blackbookEntry?.supplierVatNumber)}"></label>
      </div>
      <label>Billing address <textarea name="billingAddress" required>${escapeHtml(po.blackbookEntry?.addressLine1)}</textarea></label>
      <div class="grid">
        <label>City <input name="city" required value="${escapeHtml(po.blackbookEntry?.city)}"></label>
        <label>Postcode <input name="postcode" required value="${escapeHtml(po.blackbookEntry?.postcode)}"></label>
        <label>Country <input name="country" required value="${escapeHtml(po.blackbookEntry?.country ?? "United Kingdom")}"></label>
      </div>
      <div class="grid">
        <label>Bank account name <input name="bankAccountName" required value="${escapeHtml(po.blackbookEntry?.supplierBankAccountName ?? po.blackbookEntry?.displayName ?? po.supplierName)}"></label>
        <label>Bank account number <input name="bankAccountNumber" required inputmode="numeric" value="${escapeHtml(po.blackbookEntry?.supplierBankAccountNumber)}"></label>
        <label>Sort code <input name="bankSortCode" required placeholder="00-00-00" value="${escapeHtml(po.blackbookEntry?.supplierBankSortCode)}"></label>
        <label>IBAN <input name="bankIban" value="${escapeHtml(po.blackbookEntry?.supplierBankIban)}"></label>
        <label>SWIFT / BIC <input name="bankSwift" value="${escapeHtml(po.blackbookEntry?.supplierBankSwift)}"></label>
      </div>
      <label>Insurance / compliance notes <textarea name="complianceNotes" placeholder="Public liability, certificates, right-to-work, or any other production requirements"></textarea></label>
      <button type="submit">Submit supplier details</button>
      <p class="note">Submitting this form sends your details to unlimited.bond and prepares the PO email with the document attached.</p>
    </form>
  `));
});

router.post("/:token", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isPublicToken(req.params.token)) {
      res.status(400).send(page("Supplier onboarding", "<h1>Invalid link</h1><p>This supplier onboarding link is not valid.</p>"));
      return;
    }
    const po = await loadPo(req.params.token);
    if (!po) {
      res.status(404).send(page("Supplier onboarding", "<h1>Link not found</h1><p>This supplier onboarding link is no longer available.</p>"));
      return;
    }
    if (po.onboardingCompletedAt) {
      res.send(page("Supplier onboarding complete", "<h1>Details already submitted</h1><p>Thanks, your supplier details have already been received.</p>"));
      return;
    }
    if (po.onboardingExpiresAt && po.onboardingExpiresAt < new Date()) {
      res.status(410).send(page("Supplier onboarding expired", "<h1>Link expired</h1><p>Please ask unlimited.bond for a fresh onboarding link.</p>"));
      return;
    }

    const displayName = boundedString(req.body.displayName, 160) || po.supplierName;
    const email = requiredEmail(req.body.email);
    const phone = boundedString(req.body.phone, 80);
    const website = boundedString(req.body.website, 240);
    const billingAddress = boundedString(req.body.billingAddress, 1000);
    const billingEmail = requiredEmail(req.body.billingEmail);
    const city = boundedString(req.body.city, 120);
    const postcode = boundedString(req.body.postcode, 40);
    const country = boundedString(req.body.country, 120);
    const bankAccountName = boundedString(req.body.bankAccountName, 160);
    const bankAccountNumber = boundedString(req.body.bankAccountNumber, 80);
    const bankSortCode = boundedString(req.body.bankSortCode, 40);
    const bankIban = boundedString(req.body.bankIban, 80);
    const bankSwift = boundedString(req.body.bankSwift, 40);
    const taxNumber = boundedString(req.body.taxNumber, 80);
    if (!email || !billingEmail || !billingAddress || !city || !postcode || !country || !bankAccountName || !bankAccountNumber || !bankSortCode || !taxNumber) {
      res.status(400).send(page("Supplier onboarding", "<h1>Missing details</h1><p>Please go back and complete all required fields with valid values.</p>"));
      return;
    }
    const supplierOnboarding = {
      billingAddress,
      billingEmail,
      taxNumber,
      bankAccountName,
      bankAccountNumber,
      bankSortCode,
      bankIban,
      bankSwift,
      complianceNotes: boundedString(req.body.complianceNotes, 2000),
      submittedAt: new Date().toISOString(),
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
    };

    const entry = po.blackbookEntryId
      ? await prisma.blackbookEntry.update({
          where: { id: po.blackbookEntryId },
          data: {
            entryType: BlackbookEntryType.COMPANY,
            category: BlackbookCategory.SERVICE,
            lifecycleStatus: BlackbookLifecycleStatus.SUPPLIER,
            displayName,
            companyName: displayName,
            email,
            phone: phone || null,
            website: website || null,
            addressLine1: billingAddress,
            city,
            postcode,
            country,
            supplierBillingEmail: billingEmail,
            supplierBankAccountName: bankAccountName,
            supplierBankAccountNumber: bankAccountNumber,
            supplierBankSortCode: bankSortCode,
            supplierBankIban: bankIban || null,
            supplierBankSwift: bankSwift || null,
            supplierVatNumber: taxNumber,
            supplierOnboarding,
            supplierOnboardingCompletedAt: new Date(),
          },
        })
      : await prisma.blackbookEntry.create({
          data: {
            entryType: BlackbookEntryType.COMPANY,
            category: BlackbookCategory.SERVICE,
            lifecycleStatus: BlackbookLifecycleStatus.SUPPLIER,
            displayName,
            companyName: displayName,
            email,
            phone: phone || null,
            website: website || null,
            addressLine1: billingAddress,
            city,
            postcode,
            country,
            supplierBillingEmail: billingEmail,
            supplierBankAccountName: bankAccountName,
            supplierBankAccountNumber: bankAccountNumber,
            supplierBankSortCode: bankSortCode,
            supplierBankIban: bankIban || null,
            supplierBankSwift: bankSwift || null,
            supplierVatNumber: taxNumber,
            supplierOnboarding,
            supplierOnboardingCompletedAt: new Date(),
          },
        });

    await prisma.purchaseOrderGroup.update({
      where: { id: po.id },
      data: {
        supplierName: displayName,
        supplierEmail: email,
        supplierPhone: phone || null,
        blackbookEntryId: entry.id,
        onboardingCompletedAt: new Date(),
      },
    });

    await createPurchaseOrderEmailDraft(po.id);
    res.send(page("Supplier onboarding complete", `
      <h1>Thanks, details received</h1>
      <p>Your supplier profile has been submitted to unlimited.bond. The purchase order email has been prepared with the PO attached.</p>
    `));
  } catch (err) {
    res.status(400).send(page("Supplier onboarding failed", `<h1>Submission failed</h1><p>${escapeHtml(err instanceof Error ? err.message : "Please try again.")}</p>`));
  }
});

export default router;
