import prisma from "../prisma";

// Job code format: YYNN — last 2 digits of year + sequential number, resets to 01 each January
// e.g. 2601, 2647
export async function generateJobCode(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst({ orderBy: { createdAt: "asc" } });
    if (!settings) throw new Error("Settings row required before generating job codes");

    const year = new Date().getFullYear();
    const yy = String(year).slice(2);
    const nextSequence = settings.jobCodeYear === year ? settings.jobCodeSequence + 1 : 1;

    await tx.settings.update({
      where: { id: settings.id },
      data: { jobCodeYear: year, jobCodeSequence: nextSequence },
    });

    return `${yy}${String(nextSequence).padStart(2, "0")}`;
  });
}
