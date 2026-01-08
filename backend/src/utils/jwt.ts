import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

type AccessTokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
};

type RefreshTokenPayload = {
  userId: string;
  tokenId: string;
  type: "refresh";
};

const accessSecret = process.env.JWT_SECRET ?? "";
const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "";
const accessExpiresIn = process.env.JWT_EXPIRES_IN ?? "15m";
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";

if (!accessSecret || !refreshSecret) {
  // eslint-disable-next-line no-console
  console.warn("JWT secrets are not configured.");
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, accessSecret, { expiresIn: accessExpiresIn as any });
}

export function signRefreshToken(payload: RefreshTokenPayload) {
  return jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn as any });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, refreshSecret) as RefreshTokenPayload;
}

export function getRefreshExpiresIn() {
  return refreshExpiresIn;
}
