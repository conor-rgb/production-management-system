import prisma from "../prisma";

// Job code format: YYNN — last 2 digits of year + sequential number, resets to 01 each January
// e.g. 2601, 2647
export async function generateJobCode(): Promise<string> {
  const year = new Date().getFullYear();
  const yy = String(year).slice(2);
  const prefix = yy;

  // Find the highest existing job code for this year
  const latest = await prisma.production.findFirst({
    where: { jobCode: { startsWith: prefix } },
    orderBy: { jobCode: "desc" },
    select: { jobCode: true },
  });

  let seq = 1;
  if (latest?.jobCode) {
    const num = parseInt(latest.jobCode.slice(2), 10);
    if (!isNaN(num)) seq = num + 1;
  }

  return `${prefix}${String(seq).padStart(2, "0")}`;
}
