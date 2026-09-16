import dotenv from "dotenv";
dotenv.config();

import { startDriveWorker } from "./services/driveStorage";
import { createServer } from "./server";
import prisma from "./prisma";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { EmailProvider } from "@prisma/client";
import { seedSectionTemplates } from "./services/budgetService";
import { startIdleSync } from "./services/emailService";
import { fullGmailSync, incrementalGmailSync } from "./services/gmailSyncService";
import { syncFromGoogleCalendar, syncOpportunityFollowUpsToCalendar, syncProductionDatesToCalendar } from "./services/calendarSyncService";
import { getPrimaryAccount } from "./services/googleCalendarService";

function requireProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = ["DATABASE_URL", "SESSION_SECRET", "FRONTEND_URL"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
  if (process.env.SESSION_SECRET === "dev-secret-change-me") {
    throw new Error("SESSION_SECRET must be changed before running in production");
  }
  if (process.env.SEED_DEFAULT_ADMIN === "true") {
    throw new Error("SEED_DEFAULT_ADMIN must not be enabled in production");
  }
}

async function seedAdmin() {
  if (process.env.SEED_DEFAULT_ADMIN !== "true") return;
  if (process.env.NODE_ENV === "production") return;

  const count = await prisma.settings.count();
  if (count === 0) {
    const email = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@example.com";
    const plainPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!plainPassword) throw new Error("DEFAULT_ADMIN_PASSWORD is required when SEED_DEFAULT_ADMIN=true");
    const password = await bcrypt.hash(plainPassword, 12);
    await prisma.settings.create({
      data: { email, password },
    });
    console.log(`Seeded default admin: ${email}`);
  }
}

async function seedCrewRoles() {
  const roles = [
    "Director",
    "DOP",
    "Photographer",
    "1st AD",
    "Stylist",
    "Hair & Makeup",
    "Set Designer",
    "Producer",
    "Production Manager",
    "Runner",
    "Other",
  ];

  await Promise.all(
    roles.map((name) =>
      prisma.crewRole.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
}

async function seedEmailTemplates() {
  const count = await prisma.emailTemplate.count();
  if (count > 0) return;
  await prisma.emailTemplate.createMany({
    data: [
      {
        name: "Quote follow-up",
        subject: "Following up on our estimate",
        bodyHtml: "<p>Hi,</p><p>I wanted to follow up on the estimate we sent over. Let me know if you have any questions or would like to talk anything through.</p><p>Best,<br/>Conor</p>",
      },
      {
        name: "Shoot confirmation",
        subject: "Shoot confirmed — [job name]",
        bodyHtml: "<p>Hi,</p><p>Confirming the shoot is booked for [job name]. We will send final details as soon as they are locked.</p><p>Best,<br/>Conor</p>",
      },
      {
        name: "PPM invite",
        subject: "PPM — [job name]",
        bodyHtml: "<p>Hi,</p><p>Please find the PPM details for [job name]. Let me know if there is anything else you would like covered.</p><p>Best,<br/>Conor</p>",
      },
      {
        name: "Wrap notification",
        subject: "That's a wrap — [job name]",
        bodyHtml: "<p>Hi,</p><p>That's a wrap on [job name]. Thanks again, and we will follow up with delivery next steps.</p><p>Best,<br/>Conor</p>",
      },
      {
        name: "Invoice chase",
        subject: "Invoice reminder — [reference]",
        bodyHtml: "<p>Hi,</p><p>Just a polite reminder that invoice [reference] is still outstanding. Please let me know if you need anything else from us.</p><p>Best,<br/>Conor</p>",
      },
    ],
  });
}

async function runGmailResyncCleanup() {
  if (process.env.GMAIL_RESYNC_CLEANUP !== "true") return;
  if (process.env.GMAIL_RESYNC_DONE) return;
  console.log("[GMAIL] Wiping IMAP-synced email data for fresh Gmail API sync...");
  await prisma.emailMessage.deleteMany({});
  await prisma.emailThread.deleteMany({});
  console.log("[GMAIL] Email data wiped. Re-sync will begin shortly.");
  const envPath = path.resolve(__dirname, "../.env");
  try {
    const env = await fs.readFile(envPath, "utf8").catch(() => "");
    if (!/^GMAIL_RESYNC_DONE=/m.test(env)) {
      await fs.appendFile(envPath, `${env.endsWith("\n") || env.length === 0 ? "" : "\n"}GMAIL_RESYNC_DONE=true\n`);
      process.env.GMAIL_RESYNC_DONE = "true";
      console.log("[GMAIL] Set GMAIL_RESYNC_DONE=true in backend/.env");
    }
  } catch (err) {
    console.error("[GMAIL] Failed to persist GMAIL_RESYNC_DONE=true:", err instanceof Error ? err.message : err);
  }
}

async function initEmailSync() {
  try {
    const accounts = await prisma.emailAccount.findMany({ where: { isActive: true } });
    for (const account of accounts) {
      if (account.provider === EmailProvider.GOOGLE) {
        fullGmailSync(account).catch((err) => {
          console.error("[GMAIL SYNC] Initial sync failed:", err instanceof Error ? err.message : err);
        });
        setInterval(() => {
          incrementalGmailSync(account).catch((err) => {
            console.error("[GMAIL SYNC] Incremental sync failed:", err instanceof Error ? err.message : err);
          });
        }, 2 * 60 * 1000);
        console.log(`[GMAIL SYNC] Started sync for ${account.emailAddress}`);
      } else {
        startIdleSync(account.id).catch((err) => {
          console.error(`Failed to start IDLE for ${account.emailAddress}:`, err);
        });
      }
    }
    console.log(`Email sync started for ${accounts.length} accounts`);
  } catch (err) {
    console.error("Failed to initialise email sync:", err);
  }
}

async function initCalendarSync() {
  try {
    await syncProductionDatesToCalendar();
    await syncOpportunityFollowUpsToCalendar();
    const account = await getPrimaryAccount();
    if (account) {
      await syncFromGoogleCalendar(account);
      console.log("[CALENDAR] Google Calendar sync complete");
    }
    setInterval(() => {
      getPrimaryAccount()
        .then((nextAccount) => nextAccount ? syncFromGoogleCalendar(nextAccount) : undefined)
        .catch((err) => console.error("[CALENDAR] Interval sync failed:", err instanceof Error ? err.message : err));
    }, 5 * 60 * 1000);
  } catch (err) {
    console.error("[CALENDAR] Init sync failed:", err instanceof Error ? err.message : err);
  }
}

async function main() {
  requireProductionConfig();
  await seedAdmin();
  await seedCrewRoles();
  await seedSectionTemplates();
  await seedEmailTemplates();
  await runGmailResyncCleanup();

  const app = createServer();
  startDriveWorker();
  const port = parseInt(process.env.PORT ?? "3000", 10);

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  await initEmailSync();
  await initCalendarSync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
