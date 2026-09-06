import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export { Prisma } from "@prisma/client";
export type { User, Game } from "@prisma/client";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to packages/Db/.env or your environment."
  );
}

const pool = new pg.Pool({
  connectionString,
  // Remote Neon DB: keep TCP alive and cap pool size. Never idle-close the
  // pooled connection — a fresh TLS connect to Neon costs ~2s, which would
  // otherwise be paid by whatever request comes after an idle gap.
  max: 5,
  keepAlive: true,
});

// Neon's pooler drops client connections after ~10s of inactivity, so the
// next request would pay the ~2s reconnect. A tiny heartbeat every 5s keeps
// the pooled connection hot so queries stay at a single ~270ms round-trip.
// unref() so the timer alone never keeps the Node process alive.
const KEEPALIVE_INTERVAL_MS = 5_000;
const dbHeartbeat = setInterval(() => {
  pool.query("SELECT 1").catch((e) => {
    console.error("[heartbeat] failed:", e.message);
  });
}, KEEPALIVE_INTERVAL_MS);
dbHeartbeat.unref?.();
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// ── User helpers ──────────────────────────────────────────

export const createUser = async function (
  name: string,
  username: string,
  password?: string
) {
  return prisma.user.create({
    data: { name, username, password },
  });
};

export const findUserByUsername = async function (username: string) {
  return prisma.user.findUnique({
    where: { username },
  });
};

export const findUserById = async function (id: number) {
  return prisma.user.findUnique({
    where: { id },
  });
};

// ── Game helpers ──────────────────────────────────────────

export const createGame = async function (
  whitePlayerId: number,
  whitePlayerName: string
) {
  return prisma.game.create({
    data: {
      whitePlayerId,
      whitePlayerName,
      status: "waiting",
    },
  });
};

export const findGameById = async function (id: number) {
  return prisma.game.findUnique({ where: { id } });
};

export const findWaitingGames = async function () {
  return prisma.game.findMany({
    where: { status: "waiting" },
    orderBy: { createdAt: "desc" },
  });
};

export const findGamesByUser = async function (userId: number) {
  return prisma.game.findMany({
    where: {
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
};

export const joinGame = async function (
  gameId: number,
  blackPlayerId: number,
  blackPlayerName: string
) {
  return prisma.game.update({
    where: { id: gameId },
    data: {
      blackPlayerId,
      blackPlayerName,
      status: "active",
    },
  });
};

export const updateGame = async function (
  gameId: number,
  data: {
    fen?: string;
    turn?: string;
    status?: string;
    result?: string;
  }
) {
  return prisma.game.update({
    where: { id: gameId },
    data,
  });
};
