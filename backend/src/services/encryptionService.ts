import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key || key.length !== 32) {
    throw new Error("EMAIL_ENCRYPTION_KEY must be exactly 32 characters");
  }
  return Buffer.from(key, "utf8");
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, dataHex] = encryptedText.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted value");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
