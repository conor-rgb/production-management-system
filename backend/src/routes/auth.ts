import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { UserRole, UserType } from "@prisma/client";
import { prisma } from "../prisma";
import { sendPasswordResetEmail } from "../utils/email";
import { authenticate, requireRole } from "../middleware/auth";
import {
  getRefreshExpiresIn,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../utils/jwt";

const router = Router();

const bootstrapSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  fullName: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  fullName: z.string().min(2),
  role: z.nativeEnum(UserRole).optional(),
  userType: z.nativeEnum(UserType).optional()
});

const meUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(5).optional()
});

const forgotSchema = z.object({
  email: z.string().email()
});

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(10)
});

function parseDurationToMs(value: string) {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

function presentUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  userType: string;
  active: boolean;
  phone: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    userType: user.userType,
    active: user.active,
    phone: user.phone
  };
}

async function issueTokens(user: { id: string; email: string; role: string }) {
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    userId: user.id,
    tokenId,
    type: "refresh"
  });

  const refreshExpiresIn = getRefreshExpiresIn();
  const expiresInValue = typeof refreshExpiresIn === "string" ? refreshExpiresIn : "7d";
  const expiresAt = new Date(Date.now() + parseDurationToMs(expiresInValue));

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      expiresAt
    }
  });

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role as any
  });

  return { accessToken, refreshToken, expiresAt };
}

router.post("/bootstrap", async (req, res) => {
  const result = bootstrapSchema.safeParse(req.body);
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

  const existingCount = await prisma.user.count();
  if (existingCount > 0) {
    return res.status(409).json({
      success: false,
      error: {
        code: "BOOTSTRAP_LOCKED",
        message: "Bootstrap already completed"
      }
    });
  }

  const passwordHash = await bcrypt.hash(result.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: result.data.email,
      passwordHash,
      fullName: result.data.fullName,
      role: "ADMIN_PRODUCER",
      userType: "INTERNAL_STAFF"
    }
  });

  const tokens = await issueTokens(user);

  return res.status(201).json({
    success: true,
    data: {
      user: presentUser(user),
      tokens
    }
  });
});

router.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
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

  const user = await prisma.user.findUnique({
    where: { email: result.data.email }
  });

  if (!user || !user.active) {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password"
      }
    });
  }

  const matches = await bcrypt.compare(result.data.password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password"
      }
    });
  }

  const tokens = await issueTokens(user);

  return res.json({
    success: true,
    data: {
      user: presentUser(user),
      tokens
    }
  });
});

router.post("/refresh", async (req, res) => {
  const result = refreshSchema.safeParse(req.body);
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
    const payload = verifyRefreshToken(result.data.refreshToken);
    const record = await prisma.refreshToken.findUnique({
      where: { id: payload.tokenId }
    });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_REFRESH",
          message: "Refresh token expired or revoked"
        }
      });
    }

    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() }
    });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user || !user.active) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_REFRESH",
          message: "User no longer active"
        }
      });
    }

    const tokens = await issueTokens(user);

    return res.json({
      success: true,
      data: {
        user: presentUser(user),
        tokens
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_REFRESH",
        message: "Refresh token invalid"
      }
    });
  }
});

router.post("/logout", async (req, res) => {
  const result = refreshSchema.safeParse(req.body);
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
    const payload = verifyRefreshToken(result.data.refreshToken);
    await prisma.refreshToken.update({
      where: { id: payload.tokenId },
      data: { revokedAt: new Date() }
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      data: { message: "Already signed out" }
    });
  }

  return res.json({
    success: true,
    data: { message: "Signed out" }
  });
});

router.post("/forgot-password", async (req, res) => {
  const result = forgotSchema.safeParse(req.body);
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

  const user = await prisma.user.findUnique({
    where: { email: result.data.email }
  });

  if (user && user.active) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: expiresAt
      }
    });

    const baseUrl = process.env.FRONTEND_URL ?? "";
    const resetLink = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`
      : rawToken;

    await sendPasswordResetEmail({
      to: user.email,
      name: user.fullName,
      resetLink
    });

    const shouldReturnToken =
      process.env.ALLOW_RESET_TOKEN_IN_RESPONSE === "true" ||
      process.env.NODE_ENV !== "production";

    return res.json({
      success: true,
      data: {
        message: "If an account exists, a reset link has been sent.",
        ...(shouldReturnToken ? { resetToken: rawToken } : {})
      }
    });
  }

  return res.json({
    success: true,
    data: {
      message: "If an account exists, a reset link has been sent."
    }
  });
});

router.post("/reset-password", async (req, res) => {
  const result = resetSchema.safeParse(req.body);
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

  const tokenHash = crypto.createHash("sha256").update(result.data.token).digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: tokenHash,
      passwordResetExpires: { gt: new Date() }
    }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_RESET",
        message: "Reset token is invalid or expired"
      }
    });
  }

  const passwordHash = await bcrypt.hash(result.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null
    }
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: user.id }
  });

  return res.json({
    success: true,
    data: { message: "Password reset successfully" }
  });
});

router.post("/register", authenticate, requireRole(UserRole.ADMIN_PRODUCER), async (req, res) => {
  const result = registerSchema.safeParse(req.body);
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

  const existing = await prisma.user.findUnique({
    where: { email: result.data.email }
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      error: {
        code: "USER_EXISTS",
        message: "User with this email already exists"
      }
    });
  }

  const passwordHash = await bcrypt.hash(result.data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: result.data.email,
      passwordHash,
      fullName: result.data.fullName,
      role: result.data.role ?? UserRole.PRODUCER,
      userType: result.data.userType ?? UserType.INTERNAL_STAFF
    }
  });

  return res.status(201).json({
    success: true,
    data: {
      user: presentUser(user)
    }
  });
});

router.get("/me", authenticate, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing access token"
      }
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "User not found"
      }
    });
  }

  return res.json({
    success: true,
    data: {
      user: presentUser(user)
    }
  });
});

router.patch("/me", authenticate, async (req, res) => {
  const result = meUpdateSchema.safeParse(req.body);
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

  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing access token"
      }
    });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: result.data
  });

  return res.json({
    success: true,
    data: {
      user: presentUser(user)
    }
  });
});

export default router;
