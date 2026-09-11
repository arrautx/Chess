import "./env";
import express from "express";
import cors from "cors";
import { pathToFileURL } from "url";
import { signUp, signIn } from "./Controller/AuthController";
import { authMiddleware, type AuthRequest } from "../lib/jwt";
import { prisma } from "@repo/db";
import gameRouter from "./Router/gameRouter";
import type { NextFunction, Request, Response } from "express";

export const app = express();

app.use(cors());
app.use(express.json());


app.post("/signup", signUp);
app.post("/signin", signIn);

app.get("/me", authMiddleware, (req: AuthRequest, res) => {
  res.status(200).json({ user: req.user });
});

app.post("/logout", authMiddleware, (_req: AuthRequest, res) => {
  res.status(200).json({ message: "Logged out successfully" });
});

app.use("/api/game", gameRouter);


app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env["PORT"] || 4000;

export const startServer = function (port: number | string = PORT) {

  prisma
    .$queryRaw`SELECT 1`
    .then(() => console.log("DB connection warmed up"))
    .catch((e) => console.error("DB warmup failed (will retry on demand):", e));

  return app.listen(Number(port), () => {
    console.log(`API running on http://localhost:${port}`);
  });
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startServer();
}
