import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import projectsRoutes from "./routes/projects";
import clientsRoutes from "./routes/clients";
import suppliersRoutes from "./routes/suppliers";
import crewRoutes from "./routes/crew";
import talentRoutes from "./routes/talent";
import projectAssignmentsRoutes from "./routes/project-assignments";
import dashboardRoutes from "./routes/dashboard";
import freeagentRoutes from "./routes/freeagent";

dotenv.config();

export function createServer() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.FRONTEND_URL?.split(",") ?? "*",
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("combined"));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        service: "production-management-api",
        time: new Date().toISOString()
      }
    });
  });

  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        version: process.env.APP_VERSION ?? "0.1.0"
      }
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/projects", projectsRoutes);
  app.use("/api/projects/:projectId/assignments", projectAssignmentsRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/clients", clientsRoutes);
  app.use("/api/suppliers", suppliersRoutes);
  app.use("/api/crew", crewRoutes);
  app.use("/api/talent", talentRoutes);
  app.use("/api/freeagent", freeagentRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  });

  return app;
}
