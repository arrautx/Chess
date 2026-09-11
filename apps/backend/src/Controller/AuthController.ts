import { signinSchema, signupSchema } from "@repo/shared";
import z from "zod";
import { type Request, type Response } from "express";
import { createUser, findUserByUsername, Prisma } from "@repo/db";
import { signToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import type { User } from "@repo/db";

export const signUp = async function (req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid inputs",
      errors: z.treeifyError(parsed.error),
    });
    return;
  }

  const { name, username, password } = parsed.data;

  try {
    const hashedPassword = await hashPassword(password);

    const user = await createUser(name, username, hashedPassword);

    const token = signToken({ userId: user.id, username: user.username });

    res.status(201).json({
      message: "Signed up successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ message: "Username already taken" });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

export const signIn = async function (req: Request, res: Response) {
  const parsed = signinSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid inputs",
      errors: z.treeifyError(parsed.error),
    });
    return;
  }

  const { username, password } = parsed.data;

  try {
    const t0 = performance.now();
    const user: User | null = await findUserByUsername(username);
    console.log(`[timing] findUserByUsername: ${Math.round(performance.now() - t0)}ms`);

    if (!user || !user.password) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

    const t1 = performance.now();
    const isPasswordValid = await verifyPassword(password, user.password);
    console.log(`[timing] verifyPassword: ${Math.round(performance.now() - t1)}ms`);
    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid username or password" });
      return;
    }

    const token = signToken({ userId: user.id, username: user.username });

    res.status(200).json({
      message: "Signed in successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Signin error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
