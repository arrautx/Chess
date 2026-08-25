import { password } from "bun"
import z from "zod"

export const signupSchema = z.object({
  name: z.string().min(2),
  username: z.string().email(),
  password: z.string().min(2).max(12)
});

export const signinSchema = z.object({
  username: z.string().email(),
  password: z.string().min(2).max(12)
});




