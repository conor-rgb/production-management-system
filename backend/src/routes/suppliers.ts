import { Router } from "express";
import { z } from "zod";
import { SupplierCategory, UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  active: z.string().optional(),
  search: z.string().optional(),
  category: z.nativeEnum(SupplierCategory).optional()
});

const createSchema = z.object({
  companyName: z.string().min(2),
  category: z.nativeEnum(SupplierCategory),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional()
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
  if (result.data.category) {
    filters.category = result.data.category;
  }
  if (result.data.search) {
    filters.OR = [
      { companyName: { contains: result.data.search, mode: "insensitive" } },
      { email: { contains: result.data.search, mode: "insensitive" } }
    ];
  }

  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where: filters }),
    prisma.supplier.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: suppliers,
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

  const supplier = await prisma.supplier.create({
    data: result.data
  });

  return res.status(201).json({
    success: true,
    data: { supplier }
  });
});

router.get("/:id", async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id }
  });

  if (!supplier) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Supplier not found"
      }
    });
  }

  return res.json({
    success: true,
    data: { supplier }
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
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: result.data
    });

    return res.json({
      success: true,
      data: { supplier }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Supplier not found"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { active: false }
    });

    return res.json({
      success: true,
      data: { supplier }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Supplier not found"
      }
    });
  }
});

export default router;
