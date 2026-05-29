import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";

import authRoutes from "./routes/auth";
import dashboardRoutes from "./routes/dashboard";
import opportunitiesRoutes from "./routes/opportunities";
import productionsRoutes from "./routes/productions";
import budgetsRoutes from "./routes/budgets";
import contactsRoutes from "./routes/contacts";
import companiesRoutes from "./routes/companies";
import filesRoutes from "./routes/files";
import emailRoutes, { googleOAuthCallbackHandler } from "./routes/email";
import receiptsRoutes from "./routes/receipts";
import calendarRoutes from "./routes/calendar";
import projectActionsRoutes from "./routes/projectActions";
import settingsRoutes from "./routes/settings";
import optionsRoutes from "./routes/options";
import publicOptionsRoutes from "./routes/publicOptions";
import { requireAuth } from "./middleware/auth";

const PgSession = connectPgSimple(session);

export function createServer() {
  const app = express();

  // Trust Nginx reverse proxy so X-Forwarded-Proto is respected (needed for secure cookies)
  app.set("trust proxy", 1);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL?.split("?")[0], // strip Prisma-only query params
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  const isProd = process.env.NODE_ENV === "production";

  app.use(
    session({
      store: new PgSession({ pool, tableName: "pms_sessions", createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: isProd ? "strict" : "lax",
      },
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/public/options", publicOptionsRoutes);
  app.get("/api/email/oauth/google/callback", googleOAuthCallbackHandler);
  app.use("/api/dashboard", requireAuth, dashboardRoutes);
  app.use("/api/opportunities", requireAuth, opportunitiesRoutes);
  app.use("/api/productions", requireAuth, productionsRoutes);
  app.use("/api/budgets", requireAuth, budgetsRoutes);
  app.use("/api/contacts", requireAuth, contactsRoutes);
  app.use("/api/companies", requireAuth, companiesRoutes);
  app.use("/api/files", requireAuth, filesRoutes);
  app.use("/api/email", requireAuth, emailRoutes);
  app.use("/api/receipts", requireAuth, receiptsRoutes);
  app.use("/api/calendar", requireAuth, calendarRoutes);
  app.use("/api/project-actions", requireAuth, projectActionsRoutes);
  app.use("/api/settings", requireAuth, settingsRoutes);
  app.use("/api/options", requireAuth, optionsRoutes);

  return app;
}
