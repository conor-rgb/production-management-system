import { Router } from "express";
import { z } from "zod";
import { ClientType, UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  active: z.string().optional(),
  search: z.string().optional(),
  clientType: z.nativeEnum(ClientType).optional()
});

const createSchema = z.object({
  companyName: z.string().min(2),
  clientType: z.nativeEnum(ClientType),
  primaryContactName: z.string().min(2),
  primaryContactEmail: z.string().email(),
  primaryContactPhone: z.string().optional()
});

const updateSchema = createSchema.partial();

router.use(authenticate, requireRole(UserRole.ADMIN_PRODUCER, UserRole.PRODUCER, UserRole.COORDINATOR, UserRole.ACCOUNTANT));

router.get("/", async (req, res) => {
  const result = listQuerySchema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query",
        details: result.error.flatten()
      }
    });
  }

  const page = Math.max(Number(result.data.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(result.data.limit ?? 20), 1), 100);
  const skip = (page - 1) * limit;

  const filters: Record<string, unknown> = {};
  if (result.data.active === "true") {
    filters.active = true;
  }
  if (result.data.active === "false") {
    filters.active = false;
  }
  if (result.data.clientType) {
    filters.clientType = result.data.clientType;
  }
  if (result.data.search) {
    filters.OR = [
      { companyName: { contains: result.data.search, mode: "insensitive" } },
      { primaryContactEmail: { contains: result.data.search, mode: "insensitive" } }
    ];
  }

  const [total, clients] = await Promise.all([
    prisma.client.count({ where: filters }),
    prisma.client.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: clients,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});

router.post("/", async (req, res) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: result.error.flatten()
      }
    });
  }

  const client = await prisma.client.create({
    data: {
      companyName: result.data.companyName,
      clientType: result.data.clientType,
      primaryContactName: result.data.primaryContactName,
      primaryContactEmail: result.data.primaryContactEmail,
      primaryContactPhone: result.data.primaryContactPhone
    }
  });

  return res.status(201).json({
    success: true,
    data: { client }
  });
});

router.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { projects: true }
  });

  if (!client) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Client not found"
      }
    });
  }

  return res.json({
    success: true,
    data: { client }
  });
});

router.patch("/:id", async (req, res) => {
  const result = updateSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: result.error.flatten()
      }
    });
  }

  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: result.data
    });

    return res.json({
      success: true,
      data: { client }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Client not found"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { active: false }
    });

    return res.json({
      success: true,
      data: { client }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Client not found"
      }
    });
  }
});

export default router;
