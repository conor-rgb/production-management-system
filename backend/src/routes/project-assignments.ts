import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router({ mergeParams: true });

const assignSchema = z.object({
  userId: z.string().uuid(),
  roleOnProject: z.string().min(2)
});

function getParams(req: { params: unknown }) {
  return req.params as { projectId: string; userId?: string };
}

router.use(authenticate, requireRole(UserRole.ADMIN_PRODUCER, UserRole.PRODUCER));

router.get("/", async (req, res) => {
  const { projectId } = getParams(req);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true }
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

  if (req.user?.role !== UserRole.ADMIN_PRODUCER && project.ownerId !== req.user?.userId) {
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
      user: {
        select: { id: true, fullName: true, email: true, role: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return res.json({
    success: true,
    data: assignments
  });
});

router.post("/", async (req, res) => {
  const result = assignSchema.safeParse(req.body);
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

  const { projectId } = getParams(req);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true }
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

  if (req.user?.role !== UserRole.ADMIN_PRODUCER && project.ownerId !== req.user?.userId) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions"
      }
    });
  }

  try {
    const assignment = await prisma.projectAssignment.create({
      data: {
        projectId,
        userId: result.data.userId,
        roleOnProject: result.data.roleOnProject
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true }
        }
      }
    });

    return res.status(201).json({
      success: true,
      data: { assignment }
    });
  } catch (error) {
    return res.status(409).json({
      success: false,
      error: {
        code: "ASSIGNMENT_EXISTS",
        message: "User already assigned to project"
      }
    });
  }
});

router.delete("/:userId", async (req, res) => {
  const { projectId, userId } = getParams(req);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true }
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

  if (req.user?.role !== UserRole.ADMIN_PRODUCER && project.ownerId !== req.user?.userId) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions"
      }
    });
  }

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Missing user id"
      }
    });
  }

  try {
    await prisma.projectAssignment.delete({
      where: { projectId_userId: { projectId, userId } }
    });

    return res.status(204).send();
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Assignment not found"
      }
    });
  }
});

export default router;
