import "express-session";

declare module "express-session" {
  interface SessionData {
    driveOAuth?: { state: string; expiresAt: number };
    userId: string;
    email: string;
    unlockedSelectShareTokens?: string[];
  }
}
