// Load env files before any local import is evaluated.
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, "../.env") });
