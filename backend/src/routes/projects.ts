import { Router } from "express";
import { z } from "zod";
import { ProjectStatus, ProjectType, UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  search: z.string().optional()
});

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.nativeEnum(ProjectType),
  status: z.nativeEnum(ProjectStatus).optional(),
  clientId: z.string().uuid(),
  ownerId: z.string().uuid().optional()
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  type: z.nativeEnum(ProjectType).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  clientId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional()
});

function baseAccessFilter(user: { userId: string; role: UserRole }) {
  if (user.role === UserRole.ADMIN_PRODUCER || user.role === UserRole.ACCOUNTANT) {
    return {};
  }

  return {
    OR: [
      { ownerId: user.userId },
      { assignments: { some: { userId: user.userId } } }
    ]
  };
}

async function canAccessProject(user: { userId: string; role: UserRole }, projectId: string) {
  if (user.role === UserRole.ADMIN_PRODUCER || user.role === UserRole.ACCOUNTANT) {
    return true;
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: user.userId },
        { assignments: { some: { userId: user.userId } } }
      ]
    },
    select: { id: true }
  });

  return Boolean(project);
}

async function canEditProject(user: { userId: string; role: UserRole }, projectId: string) {
  if (user.role === UserRole.ADMIN_PRODUCER) {
    return true;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.userId },
    select: { id: true }
  });

  return Boolean(project);
}

async function generateProjectCode() {
  const year = new Date().getFullYear();
  const prefix = `PRJ-${year}-`;
  const count = await prisma.project.count({
    where: { code: { startsWith: prefix } }
  });
  const nextNumber = String(count + 1).padStart(3, "0");
  return `${prefix}${nextNumber}`;
}

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

  const filters: Record<string, unknown> = {
    ...baseAccessFilter(req.user!)
  };
  if (result.data.status) {
    filters.status = result.data.status;
  }
  if (result.data.search) {
    filters.OR = [
      { name: { contains: result.data.search, mode: "insensitive" } },
      { code: { contains: result.data.search, mode: "insensitive" } }
    ];
  }

  const [total, projects] = await Promise.all([
    prisma.project.count({ where: filters }),
    prisma.project.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        client: true,
        owner: { select: { id: true, fullName: true, email: true } }
      }
    })
  ]);

  return res.json({
    success: true,
    data: projects,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});

router.post("/", requireRole(UserRole.ADMIN_PRODUCER, UserRole.PRODUCER), async (req, res) => {
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

  const ownerId =
    req.user?.role === UserRole.ADMIN_PRODUCER && result.data.ownerId
      ? result.data.ownerId
      : req.user!.userId;

  let code = await generateProjectCode();
  let created = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      created = await prisma.project.create({
        data: {
          code,
          name: result.data.name,
          description: result.data.description,
          type: result.data.type,
          status: result.data.status ?? ProjectStatus.INQUIRY,
          clientId: result.data.clientId,
          ownerId
        },
        include: {
          client: true,
          owner: { select: { id: true, fullName: true, email: true } }
        }
      });
      break;
    } catch (error) {
      code = await generateProjectCode();
    }
  }

  if (!created) {
    return res.status(500).json({
      success: false,
      error: {
        code: "PROJECT_CODE_ERROR",
        message: "Could not generate a unique project code"
      }
    });
  }

  return res.status(201).json({
    success: true,
    data: { project: created }
  });
});

router.get("/:id/team", async (req, res) => {
  const projectId = req.params.id;
  const canAccess = await canAccessProject(req.user!, projectId);
  if (!canAccess) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions"
      }
    });
  }

  const assignments = await prisma.projectAssignment.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, fullName: true, email: true, role: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  return res.json({
    success: true,
    data: assignments
  });
});

router.get("/:id", async (req, res) => {
  const projectId = req.params.id;
  const canAccess = await canAccessProject(req.user!, projectId);
  if (!canAccess) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions"
      }
    });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      owner: { select: { id: true, fullName: true, email: true } },
      assignments: true
    }
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Project not found"
      }
    });
  }

  return res.json({
    success: true,
    data: { project }
  });
});

router.patch("/:id", async (req, res) => {
  const projectId = req.params.id;
  const canEdit = await canEditProject(req.user!, projectId);
  if (!canEdit) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions"
      }
    });
  }

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
    const project = await prisma.project.update({
      where: { id: projectId },
      data: result.data,
      include: {
        client: true,
        owner: { select: { id: true, fullName: true, email: true } }
      }
    });

    return res.json({
      success: true,
      data: { project }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Project not found"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  const projectId = req.params.id;
  const canEdit = await canEditProject(req.user!, projectId);
  if (!canEdit) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions"
      }
    });
  }

  try {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.ARCHIVED,
        archivedAt: new Date()
      },
      include: {
        client: true,
        owner: { select: { id: true, fullName: true, email: true } }
      }
    });

    return res.json({
      success: true,
      data: { project }
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Project not found"
      }
    });
  }
});

export default router;
