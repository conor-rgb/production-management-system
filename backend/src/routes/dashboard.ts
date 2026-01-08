import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

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

router.use(authenticate, requireRole(UserRole.ADMIN_PRODUCER, UserRole.PRODUCER, UserRole.COORDINATOR, UserRole.ACCOUNTANT));

router.get("/stats", async (req, res) => {
  const accessFilter = baseAccessFilter(req.user!);

  const [projectsActive, projectsTotal, clientsActive, crewActive, talentActive] = await Promise.all([
    prisma.project.count({
      where: {
        ...accessFilter,
        status: { not: "ARCHIVED" }
      }
    }),
    prisma.project.count({ where: accessFilter }),
    prisma.client.count({ where: { active: true } }),
    prisma.crewMember.count({ where: { active: true } }),
    prisma.talentProfile.count({ where: { active: true } })
  ]);

  return res.json({
    success: true,
    data: {
      projectsActive,
      projectsTotal,
      clientsActive,
      crewActive,
      talentActive
    }
  });
});

export default router;
