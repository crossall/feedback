import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export type ReportFormat = "none" | "pdf" | "html";

export type EvaluationOutputOptions = {
  showOnScreen: boolean;
  appendToGoogleDoc: boolean;
  reportFormat: ReportFormat;
};

export const defaultOutputOptions: EvaluationOutputOptions = {
  showOnScreen: true,
  appendToGoogleDoc: false,
  reportFormat: "none",
};

export function normalizeOutputOptions(
  value?: Partial<EvaluationOutputOptions>,
): EvaluationOutputOptions {
  const reportFormat = value?.reportFormat;
  return {
    showOnScreen: value?.showOnScreen !== false,
    appendToGoogleDoc: value?.appendToGoogleDoc === true,
    reportFormat: reportFormat === "pdf" || reportFormat === "html"
      ? reportFormat
      : "none",
  };
}

export type ClassConfig = {
  apiKey: string;
  model: string;
  classTitle: string;
  assignment: string;
  rubric: string;
  instruction: string;
  outputOptions: EvaluationOutputOptions;
};

function getKey() {
  const secret = process.env.CLASS_CONFIG_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CLASS_CONFIG_SECRET is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptClassConfig(config: ClassConfig) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptClassConfig(token: string): ClassConfig {
  const payload = Buffer.from(token, "base64url");
  if (payload.length < 29) throw new Error("Invalid class token.");

  const decipher = createDecipheriv("aes-256-gcm", getKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const config = JSON.parse(
    Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as ClassConfig;

  if (!config.apiKey || !config.assignment || !config.rubric || !config.classTitle) {
    throw new Error("Incomplete class config.");
  }
  return {
    ...config,
    outputOptions: normalizeOutputOptions(config.outputOptions),
  };
}
