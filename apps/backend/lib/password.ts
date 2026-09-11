// Password hashing via argon2 — works on Node.js (tsx) and Bun alike.
// argon2id is the same algorithm Bun.password used, so existing
// `$argon2id$...` hashes in the database verify without migration.
import argon2 from "argon2";

/** Hash a plaintext password (argon2id, defaults: m=64MB, t=3, p=4). */
export const hashPassword = function (password: string): Promise<string> {
  return argon2.hash(password);
};

/**
 * Verify a plaintext password against a stored hash.
 * Returns false (instead of throwing) for malformed/unknown hash formats.
 */
export const verifyPassword = async function (
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
};
