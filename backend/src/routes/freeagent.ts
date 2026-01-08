import { Router } from "express";
import crypto from "crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

type FreeAgentTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type FreeAgentContact = {
  url: string;
  contact_type?: string | null;
  organisation_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  mobile?: string | null;
};

type FreeAgentContactsResponse = {
  contacts: FreeAgentContact[];
  meta?: { page?: number; total_pages?: number };
  pagination?: { page?: number; total_pages?: number };
};

const router = Router();

function getApiBaseUrl() {
  return process.env.FREEAGENT_SANDBOX === "true"
    ? "https://api.sandbox.freeagent.com"
    : "https://api.freeagent.com";
}

function getAuthBaseUrl() {
  return process.env.FREEAGENT_SANDBOX === "true"
    ? "https://api.sandbox.freeagent.com"
    : "https://api.freeagent.com";
}

function requireFreeAgentConfig() {
  const clientId = process.env.FREEAGENT_CLIENT_ID ?? "";
  const clientSecret = process.env.FREEAGENT_CLIENT_SECRET ?? "";
  const redirectUri = process.env.FREEAGENT_REDIRECT_URI ?? "";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("FreeAgent OAuth config is missing.");
  }
  return { clientId, clientSecret, redirectUri };
}

async function fetchToken(payload: Record<string, string>) {
  const { clientId, clientSecret } = requireFreeAgentConfig();
  const response = await fetch(`${getApiBaseUrl()}/v2/token_endpoint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      ...payload,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "FreeAgent token request failed.");
  }

  return (await response.json()) as FreeAgentTokenResponse;
}

async function getValidAccessToken() {
  const credential = await prisma.freeAgentCredential.findUnique({
    where: { id: "default" }
  });
  if (!credential) {
    throw new Error("FreeAgent is not connected.");
  }

  const shouldRefresh = credential.expiresAt.getTime() - Date.now() < 60_000;
  if (!shouldRefresh) {
    return credential.accessToken;
  }

  const token = await fetchToken({
    grant_type: "refresh_token",
    refresh_token: credential.refreshToken
  });
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);

  const updated = await prisma.freeAgentCredential.update({
    where: { id: "default" },
    data: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt
    }
  });

  return updated.accessToken;
}

async function fetchAllContacts(accessToken: string) {
  const contacts: FreeAgentContact[] = [];
  const perPage = 100;
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetch(
      `${getApiBaseUrl()}/v2/contacts?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to fetch FreeAgent contacts.");
    }

    const payload = (await response.json()) as FreeAgentContactsResponse;
    contacts.push(...(payload.contacts ?? []));
    const meta = payload.meta ?? payload.pagination ?? {};
    totalPages = meta.total_pages ?? 1;
    page = (meta.page ?? page) + 1;
  }

  return contacts;
}

router.use(authenticate, requireRole(UserRole.ADMIN_PRODUCER, UserRole.ACCOUNTANT));

router.get("/status", async (_req, res) => {
  const credential = await prisma.freeAgentCredential.findUnique({
    where: { id: "default" }
  });

  return res.json({
    success: true,
    data: {
      connected: Boolean(credential),
      expiresAt: credential?.expiresAt ?? null,
      accountId: credential?.accountId ?? null
    }
  });
});

router.get("/authorize", async (_req, res) => {
  const { clientId, redirectUri } = requireFreeAgentConfig();
  const scope = process.env.FREEAGENT_SCOPES ?? "contacts";
  const state = crypto.randomBytes(16).toString("hex");

  const url = new URL(`${getAuthBaseUrl()}/v2/approve_app`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  return res.json({
    success: true,
    data: { url: url.toString() }
  });
});

router.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MISSING_CODE",
        message: "Missing authorization code"
      }
    });
  }

  try {
    const { redirectUri } = requireFreeAgentConfig();
    const token = await fetchToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });
    const expiresAt = new Date(Date.now() + token.expires_in * 1000);

    await prisma.freeAgentCredential.upsert({
      where: { id: "default" },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt
      },
      create: {
        id: "default",
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt
      }
    });

    const redirectBase = process.env.FRONTEND_URL ?? "/";
    const redirectUrl = new URL(redirectBase);
    redirectUrl.pathname = "/dashboard";
    redirectUrl.searchParams.set("freeagent", "connected");
    return res.redirect(redirectUrl.toString());
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: "FREEAGENT_OAUTH_FAILED",
        message: error instanceof Error ? error.message : "FreeAgent OAuth failed"
      }
    });
  }
});

router.post("/sync/contacts", async (_req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const contacts = await fetchAllContacts(accessToken);

    let createdClients = 0;
    let updatedClients = 0;
    let skippedClients = 0;
    let createdSuppliers = 0;
    let updatedSuppliers = 0;

    for (const contact of contacts) {
      const id = contact.url.split("/").pop();
      if (!id) {
        continue;
      }

      const isClient = contact.contact_type === "customer";
      const companyName =
        contact.organisation_name ||
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        "FreeAgent Contact";

      if (isClient) {
        if (!contact.email) {
          skippedClients += 1;
          continue;
        }

        const existing = await prisma.client.findUnique({
          where: { freeagentContactId: id }
        });

        if (existing) {
          await prisma.client.update({
            where: { id: existing.id },
            data: {
              companyName,
              primaryContactName:
                [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
                existing.primaryContactName,
              primaryContactEmail: contact.email,
              primaryContactPhone: contact.phone_number ?? contact.mobile ?? existing.primaryContactPhone
            }
          });
          updatedClients += 1;
        } else {
          await prisma.client.create({
            data: {
              companyName,
              clientType: "DIRECT_BRAND",
              primaryContactName:
                [contact.first_name, contact.last_name].filter(Boolean).join(" ") || companyName,
              primaryContactEmail: contact.email,
              primaryContactPhone: contact.phone_number ?? contact.mobile ?? undefined,
              freeagentContactId: id
            }
          });
          createdClients += 1;
        }
      } else {
        const existing = await prisma.supplier.findUnique({
          where: { freeagentContactId: id }
        });

        if (existing) {
          await prisma.supplier.update({
            where: { id: existing.id },
            data: {
              companyName,
              email: contact.email ?? existing.email,
              phone: contact.phone_number ?? contact.mobile ?? existing.phone
            }
          });
          updatedSuppliers += 1;
        } else {
          await prisma.supplier.create({
            data: {
              companyName,
              category: "OTHER",
              email: contact.email ?? undefined,
              phone: contact.phone_number ?? contact.mobile ?? undefined,
              freeagentContactId: id
            }
          });
          createdSuppliers += 1;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        contacts: contacts.length,
        createdClients,
        updatedClients,
        skippedClientsMissingEmail: skippedClients,
        createdSuppliers,
        updatedSuppliers
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: "FREEAGENT_SYNC_FAILED",
        message: error instanceof Error ? error.message : "FreeAgent sync failed"
      }
    });
  }
});

export default router;
