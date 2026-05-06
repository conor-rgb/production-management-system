import dotenv from "dotenv";
dotenv.config();

import { createServer } from "./server";
import prisma from "./prisma";
import bcrypt from "bcryptjs";

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

async function main() {
  await seedAdmin();
  await seedCrewRoles();

  const app = createServer();
  const port = parseInt(process.env.PORT ?? "3000", 10);

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
