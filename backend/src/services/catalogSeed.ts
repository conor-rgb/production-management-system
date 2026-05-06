import prisma from "../prisma";
import { AICP_SECTIONS } from "./aicp";

export async function seedCatalogItems() {
  const count = await prisma.catalogItem.count();
  if (count > 0) return;

  await prisma.catalogItem.createMany({
    data: AICP_SECTIONS.flatMap((section) =>
      section.items.map((description, index) => ({
        section: section.code,
        description,
        order: index,
      }))
    ),
    skipDuplicates: true,
  });
}
