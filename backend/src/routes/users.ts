import { Router } from "express";
import { z } from "zod";
import { UserRole, UserType } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  active: z.string().optional(),
  role: z.nativeEnum(UserRole).optional()
});

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(5).optional(),
  role: z.nativeEnum(UserRole).optional(),
  userType: z.nativeEnum(UserType).optional(),
  active: z.boolean().optional()
});

router.use(authenticate, requireRole(UserRole.ADMIN_PRODUCER));

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
  if (result.data.role) {
    filters.role = result.data.role;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where: filters }),
    prisma.user.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        userType: true,
        active: true,
        phone: true,
        createdAt: true
      }
    })
  ]);

  return res.json({
    success: true,
    data: users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
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

  const userId = req.params.id;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: result.data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        userType: true,
        active: true,
        phone: true,
        createdAt: true
      }
    });

    return res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "User not found"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { active: false },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        userType: true,
        active: true,
        phone: true,
        createdAt: true
      }
    });

    return res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "User not found"
      }
    });
  }
});

export default router;
