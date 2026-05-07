import { EmailAccount, EmailProvider } from "@prisma/client";
import prisma from "../prisma";

export async function getPrimaryAccount(): Promise<EmailAccount | null> {
  return prisma.emailAccount.findFirst({
    where: {
      provider: EmailProvider.GOOGLE,
      isActive: true,
      encryptedAccessToken: { not: null },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}
