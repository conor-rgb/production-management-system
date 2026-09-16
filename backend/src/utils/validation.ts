import { NextFunction, Request, RequestHandler, Response } from "express";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{12,256}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function stringParam(req: Request, res: Response, name: string, pattern: RegExp = ID_PATTERN): string | null {
  const value = req.params[name];
  if (typeof value !== "string" || !pattern.test(value)) {
    res.status(400).json({ error: `Invalid ${name}` });
    return null;
  }
  return value;
}

export function tokenParam(req: Request, res: Response, name = "token"): string | null {
  return stringParam(req, res, name, TOKEN_PATTERN);
}

export function isPublicToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function optionalEmail(value: unknown, maxLength = 254): string | undefined {
  const email = boundedString(value, maxLength).toLowerCase();
  if (!email) return undefined;
  return EMAIL_PATTERN.test(email) ? email : undefined;
}

export function requiredEmail(value: unknown, maxLength = 254): string | null {
  const email = optionalEmail(value, maxLength);
  return email ?? null;
}

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : fallback;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

type Validator<T> = (value: unknown) => { ok: true; value: T } | { ok: false; error: string };

declare module "express-serve-static-core" {
  interface Request {
    validatedBody?: unknown;
    validatedQuery?: unknown;
    validatedParams?: unknown;
  }
}

function validateRequestPart<T>(
  source: "body" | "query" | "params",
  target: "validatedBody" | "validatedQuery" | "validatedParams",
  validator: Validator<T>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = validator(req[source]);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    req[target] = result.value;
    next();
  };
}

export function validateBody<T>(validator: Validator<T>): RequestHandler {
  return validateRequestPart("body", "validatedBody", validator);
}

export function validateParams<T>(validator: Validator<T>): RequestHandler {
  return validateRequestPart("params", "validatedParams", validator);
}

export function validatedBody<T>(req: Request): T {
  return req.validatedBody as T;
}

export function validatedParams<T>(req: Request): T {
  return req.validatedParams as T;
}

export type LoginBody = {
  email: string;
  password: string;
};

export const loginBodyValidator: Validator<LoginBody> = (value: unknown) => {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const email = requiredEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return { ok: false, error: "Email and password required" };
  if (password.length > 512) return { ok: false, error: "Invalid credentials" };
  return { ok: true, value: { email, password } };
};

export type PublicTokenParams = {
  token: string;
};

export const publicTokenParamsValidator: Validator<PublicTokenParams> = (value: unknown) => {
  const params = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!isPublicToken(params.token)) return { ok: false, error: "Invalid token" };
  return { ok: true, value: { token: params.token } };
};
