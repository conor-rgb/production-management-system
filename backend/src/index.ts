import dotenv from "dotenv";
dotenv.config();

import { createServer } from "./server";
import prisma from "./prisma";
import bcrypt from "bcryptjs";
import { seedCatalogItems } from "./services/catalogSeed";
import { startIdleSync } from "./services/emailService";

async function seedAdmin() {
  const count = await prisma.settings.count();
  if (count === 0) {
    const password = await bcrypt.hash("admin", 12);
    await prisma.settings.create({
      data: { email: "admin@example.com", password },
    });
    console.log("Seeded default admin: admin@example.com / admin");
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

async function initEmailSync() {
  try {
    const accounts = await prisma.emailAccount.findMany({ where: { isActive: true } });
    for (const account of accounts) {
      startIdleSync(account.id).catch((err) => {
        console.error(`Failed to start IDLE for ${account.emailAddress}:`, err);
      });
    }
    console.log(`Email sync started for ${accounts.length} accounts`);
  } catch (err) {
    console.error("Failed to initialise email sync:", err);
  }
}

async function main() {
  await seedAdmin();
  await seedCrewRoles();
  await seedCatalogItems();
  await seedEmailTemplates();

  const app = createServer();
  const port = parseInt(process.env.PORT ?? "3000", 10);

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  await initEmailSync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
