import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

// apps/backend/.env — PORT, JWT_SECRET
dotenv.config({ path: join(here, "../.env") });
// packages/Db/.env — DATABASE_URL (also loaded by the Prisma CLI)
dotenv.config({ path: join(here, "../../../packages/Db/.env") });
