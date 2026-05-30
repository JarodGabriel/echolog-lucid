import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_SECRET_FALLBACK = "echolog-lucid-dev-secret-change-me";

function key() {
  if (!process.env.APP_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET is required in production.");
  }

  return createHash("sha256")
    .update(process.env.APP_SECRET || COOKIE_SECRET_FALLBACK)
    .digest();
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function sign(value: string) {
  return createHmac("sha256", key()).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string) {
  const expected = sign(value);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function sealJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function unsealJson<T>(sealed: string): T | null {
  const [ivPart, tagPart, encryptedPart] = sealed.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    return null;
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}
