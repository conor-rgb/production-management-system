import { Router } from "express";
import { z } from "zod";
import { TaxStatus, UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  active: z.string().optional(),
  search: z.string().optional(),
  role: z.string().optional()
});

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  mobile: z.string().optional(),
  primaryRole: z.string().min(2),
  experienceLevel: z.string().optional(),
  taxStatus: z.nativeEnum(TaxStatus).optional(),
  dayRate: z.number().optional(),
  halfDayRate: z.number().optional(),
  overtimeRate: z.number().optional(),
  kitFee: z.number().optional(),
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
  if (result.data.search) {
    filters.OR = [
      { fullName: { contains: result.data.search, mode: "insensitive" } },
      { email: { contains: result.data.search, mode: "insensitive" } }
    ];
  }
  if (result.data.role) {
    filters.primaryRole = { contains: result.data.role, mode: "insensitive" };
  }

  const [total, crew] = await Promise.all([
    prisma.crewMember.count({ where: filters }),
    prisma.crewMember.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: crew,
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

  try {
    const crewMember = await prisma.crewMember.create({
      data: {
        fullName: result.data.fullName,
        email: result.data.email,
        mobile: result.data.mobile,
        primaryRole: result.data.primaryRole,
        experienceLevel: result.data.experienceLevel ?? "",
        taxStatus: result.data.taxStatus,
        dayRate: result.data.dayRate,
        halfDayRate: result.data.halfDayRate,
        overtimeRate: result.data.overtimeRate,
        kitFee: result.data.kitFee,
        notes: result.data.notes
      }
    });

    return res.status(201).json({
      success: true,
      data: { crewMember }
    });
  } catch (error) {
    return res.status(409).json({
      success: false,
      error: {
        code: "CREW_EXISTS",
        message: "Crew member already exists"
      }
    });
  }
});

router.get("/:id", async (req, res) => {
  const crewMember = await prisma.crewMember.findUnique({
    where: { id: req.params.id }
  });

  if (!crewMember) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Crew member not found"
      }
    });
  }

  return res.json({
    success: true,
    data: { crewMember }
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
    const crewMember = await prisma.crewMember.update({
      where: { id: req.params.id },
      data: result.data
    });

    return res.json({
      success: true,
      data: { crewMember }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Crew member not found"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const crewMember = await prisma.crewMember.update({
      where: { id: req.params.id },
      data: { active: false }
    });

    return res.json({
      success: true,
      data: { crewMember }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Crew member not found"
      }
    });
  }
});

export default router;
