import jwt, {
  type Secret,
  type SignOptions,
} from "jsonwebtoken";
import dotenv from "dotenv";
import type { Request, Response, NextFunction } from "express";

dotenv.config();

const JWT_SECRET: Secret = process.env["JWT_SECRET"] ?? "";

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Add it to apps/backend/.env or your environment."
  );
}

const DEFAULT_EXPIRES_IN: SignOptions["expiresIn"] = "7d";

/** Payload we store inside the JWT. Keep it small — never put passwords in here. */
export interface AuthTokenPayload {
  userId: number;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["userId"] === "number" && typeof v["username"] === "string";
}

/** Sign a new JWT for an authenticated user. */
export const signToken = function (
  payload: AuthTokenPayload,
  options?: SignOptions
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: DEFAULT_EXPIRES_IN,
    ...options,
  });
};

/**
 * Verify a JWT and return its payload.
 * @throws JsonWebTokenError | TokenExpiredError | NotBeforeError on invalid/expired tokens.
 */
export const verifyToken = function (token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (typeof decoded === "string" || !isAuthTokenPayload(decoded)) {
    throw new jwt.JsonWebTokenError("Invalid token payload");
  }

  return { userId: decoded.userId, username: decoded.username };
};

/** Extract a Bearer token from the Authorization header. Returns null if missing/malformed. */
export const getTokenFromHeader = function (
  req: Request
): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
};

/**
 * Express middleware: requires a valid `Authorization: Bearer <token>` header.
 * On success sets `req.user` and calls `next()`.
 * On failure responds 401 and stops the chain.
 */
export const authMiddleware = function (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token = getTokenFromHeader(req);

  if (!token) {
    res.status(401).json({ message: "Missing or malformed auth token" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: "Token expired" });
      return;
    }
    res.status(401).json({ message: "Invalid token" });
  }
};
