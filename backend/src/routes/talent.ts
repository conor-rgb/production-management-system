import { Router } from "express";
import { z } from "zod";
import { TalentType, UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  active: z.string().optional(),
  search: z.string().optional(),
  talentType: z.nativeEnum(TalentType).optional()
});

const createSchema = z.object({
  fullName: z.string().min(2),
  stageName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  talentType: z.nativeEnum(TalentType),
  experienceLevel: z.string().optional(),
  dayRate: z.number().optional(),
  halfDayRate: z.number().optional(),
  hourlyRate: z.number().optional(),
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
  if (result.data.talentType) {
    filters.talentType = result.data.talentType;
  }
  if (result.data.search) {
    filters.OR = [
      { fullName: { contains: result.data.search, mode: "insensitive" } },
      { stageName: { contains: result.data.search, mode: "insensitive" } },
      { email: { contains: result.data.search, mode: "insensitive" } }
    ];
  }

  const [total, talent] = await Promise.all([
    prisma.talentProfile.count({ where: filters }),
    prisma.talentProfile.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: talent,
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

  const profile = await prisma.talentProfile.create({
    data: {
      fullName: result.data.fullName,
      stageName: result.data.stageName,
      email: result.data.email,
      phone: result.data.phone,
      talentType: result.data.talentType,
      experienceLevel: result.data.experienceLevel ?? "",
      dayRate: result.data.dayRate,
      halfDayRate: result.data.halfDayRate,
      hourlyRate: result.data.hourlyRate,
      notes: result.data.notes
    }
  });

  return res.status(201).json({
    success: true,
    data: { profile }
  });
});

router.get("/:id", async (req, res) => {
  const profile = await prisma.talentProfile.findUnique({
    where: { id: req.params.id }
  });

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Talent not found"
      }
    });
  }

  return res.json({
    success: true,
    data: { profile }
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
    const profile = await prisma.talentProfile.update({
      where: { id: req.params.id },
      data: result.data
    });

    return res.json({
      success: true,
      data: { profile }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Talent not found"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const profile = await prisma.talentProfile.update({
      where: { id: req.params.id },
      data: { active: false }
    });

    return res.json({
      success: true,
      data: { profile }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Talent not found"
      }
    });
  }
});

export default router;
