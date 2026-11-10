import { del as blobDel, get as blobGet, list as blobList, put as blobPut } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.PROJECT_EXPO_BASE_URL || "https://feedforward.kr";
const CLEAR_TARGET = process.argv.includes("--clear");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const INCLUDE_FINAL_PDFS = process.argv.includes("--include-final-pdfs");
const REQUEST_TIMEOUT_MS = 120_000;
const TARGET_BASE_PATH = "project_expo/storage/shared/";

const SOURCE_SCOPE = "project1";
const TARGET_SCOPE = "project_expo";
const SKIP_PREFIXES = [
  "pj_ai_cache_",
  "pj_ai_cache_v_",
  "pj_ai_lock_",
  "pj_results_cache",
  "pj_reflections_cache",
];
const SKIP_KEY_PARTS = ["backup"];
const PDF_FIELD_NAMES = new Set(["pdfData"]);
const FILE_FIELD_NAMES = new Set(["fileName", "sourceFileName"]);

async function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  try {
    const text = await readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Vercel Blob can still work if the token is already in the environment.
  }
}

async function storage(scope, body) {
  if (scope === TARGET_SCOPE) return targetStorage(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/api/${scope}/storage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${scope} storage failed: ${data?.error || response.statusText}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function getValue(scope, key) {
  const result = await storage(scope, { action: "get", key });
  return result?.value || null;
}

async function listKeys(scope, prefix = "") {
  const result = await storage(scope, { action: "list", prefix });
  return Array.isArray(result?.keys) ? result.keys : [];
}

function targetBlobPath(key) {
  return `${TARGET_BASE_PATH}${encodeURIComponent(key)}.json`;
}

function targetLegacyBlobPath(key) {
  return `${TARGET_BASE_PATH}${key}.json`;
}

function keyFromTargetPath(pathname) {
  const encoded = pathname.slice(TARGET_BASE_PATH.length).replace(/\.json$/, "");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function targetDirectGet(key) {
  const canonicalPath = targetBlobPath(key);
  const legacyPath = targetLegacyBlobPath(key);
  let result = await blobGet(canonicalPath, {
    access: "private",
    useCache: false,
  });
  if (!result && legacyPath !== canonicalPath) {
    result = await blobGet(legacyPath, {
      access: "private",
      useCache: false,
    });
  }
  if (!result) return null;
  return { value: await new Response(result.stream).text() };
}

async function targetDirectGetFromListedBlob(key) {
  const stablePrefix = key.includes("::") ? key.slice(0, key.indexOf("::")) : key;
  const prefixes = Array.from(new Set([
    `${TARGET_BASE_PATH}${encodeURIComponent(stablePrefix)}`,
    `${TARGET_BASE_PATH}${stablePrefix}`,
  ]));

  for (const prefix of prefixes) {
    const result = await blobList({ prefix });
    const blob = result.blobs.find((item) => keyFromTargetPath(item.pathname) === key);
    const url = blob?.downloadUrl || blob?.url;
    if (!url) continue;
    const blobResult = await blobGet(url, {
      access: "private",
      useCache: false,
    });
    if (blobResult) return { value: await new Response(blobResult.stream).text() };
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) return { value: await response.text() };
  }
  return null;
}

async function targetDirectSet(key, value) {
  if (value === "null") {
    await Promise.allSettled([
      blobDel(targetBlobPath(key)),
      targetLegacyBlobPath(key) !== targetBlobPath(key) ? blobDel(targetLegacyBlobPath(key)) : Promise.resolve(),
    ]);
    return { ok: true };
  }
  await blobPut(targetBlobPath(key), value, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return { ok: true };
}

async function targetDirectList(prefix = "") {
  const result = await blobList({
    prefix: `${TARGET_BASE_PATH}${encodeURIComponent(prefix)}`,
  });
  return { keys: result.blobs.map((blob) => keyFromTargetPath(blob.pathname)) };
}

async function targetStorage(body) {
  if (body.action === "get") {
    const key = String(body.key || "");
    return await targetDirectGet(key) || await targetDirectGetFromListedBlob(key);
  }
  if (body.action === "set") return targetDirectSet(String(body.key || ""), typeof body.value === "string" ? body.value : "null");
  if (body.action === "list") return targetDirectList(String(body.prefix || ""));
  throw new Error("Invalid target storage action.");
}

function parseStoredJson(value, key) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Could not parse ${key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildAnonymizer(config) {
  const aliasByComposite = new Map();
  const displayAliasByComposite = new Map();
  const knownNames = new Set();
  const anonymousConfig = structuredClone(config);

  anonymousConfig.project = {
    ...(anonymousConfig.project || {}),
    title: `${anonymousConfig.project?.title || "프로젝트"} 온라인 전시관`,
    desc: `${anonymousConfig.project?.desc || ""}\n\n이 화면은 전시용 익명 사본입니다. 학생 이름과 원본 PDF 파일은 공개하지 않습니다.`.trim(),
  };

  anonymousConfig.groups = (anonymousConfig.groups || []).map((group) => {
    const members = Array.isArray(group.members) ? group.members : [];
    return {
      ...group,
      members: members.map((name, index) => {
        const alias = `학생 ${index + 1}`;
        knownNames.add(String(name));
        aliasByComposite.set(`${group.id}::${name}`, `${group.id}::${alias}`);
        displayAliasByComposite.set(`${group.id}::${name}`, alias);
        return alias;
      }),
    };
  });

  const sortedNames = [...knownNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const sortedComposites = [...aliasByComposite.entries()]
    .sort(([a], [b]) => b.length - a.length);

  function sanitizeString(value) {
    let next = String(value);
    for (const [from, to] of sortedComposites) next = next.split(from).join(to);
    for (const name of sortedNames) next = next.split(name).join("학생");
    return next;
  }

  function sanitizeKey(value) {
    return sanitizeString(value);
  }

  function sanitizeAny(value, recordKey) {
    if (Array.isArray(value)) return value.map((item) => sanitizeAny(item, recordKey));
    if (value && typeof value === "object") {
      const out = {};
      for (const [rawKey, rawValue] of Object.entries(value)) {
        if (PDF_FIELD_NAMES.has(rawKey)) {
          if (INCLUDE_FINAL_PDFS && recordKey.startsWith("pj_sub_") && !recordKey.startsWith("pj_sub_meta_")) {
            out[rawKey] = rawValue;
          }
          continue;
        }
        const key = sanitizeKey(rawKey);
        if (FILE_FIELD_NAMES.has(rawKey)) {
          out[key] = recordKey.startsWith("pj_draft_") ? "전시용 초안.pdf" : "전시용 결과물.pdf";
          continue;
        }
        out[key] = sanitizeAny(rawValue, recordKey);
      }
      return out;
    }
    if (typeof value === "string") return sanitizeString(value);
    return value;
  }

  function sanitizeValue(key, value) {
    if (key === "pj_config") return anonymousConfig;
    const sanitized = sanitizeAny(value, key);
    if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
      const by = typeof sanitized.by === "string" ? sanitized.by : "";
      const originalBy = [...displayAliasByComposite.keys()].find((candidate) => sanitizeString(candidate) === by);
      if (originalBy && "name" in sanitized) sanitized.name = displayAliasByComposite.get(originalBy);
      if ("submittedBy" in sanitized) sanitized.submittedBy = "학생";
    }
    return sanitized;
  }

  function validateNoKnownNames(key, value) {
    const text = `${key}\n${JSON.stringify(value)}`;
    const leaked = sortedNames.find((name) => name && text.includes(name));
    if (leaked) throw new Error(`Anonymization failed for ${key}: leaked ${leaked}`);
  }

  return {
    anonymousConfig,
    knownNames: sortedNames,
    sanitizeKey,
    sanitizeValue,
    validateNoKnownNames,
  };
}

function shouldSkipKey(key) {
  return SKIP_PREFIXES.some((prefix) => key.startsWith(prefix))
    || SKIP_KEY_PARTS.some((part) => key.toLowerCase().includes(part));
}

async function verifyTarget(anonymizer) {
  const result = await blobList({ prefix: TARGET_BASE_PATH });
  const blobs = result.blobs;
  let checked = 0;
  let finalPdfs = 0;
  for (const blob of blobs) {
    const key = keyFromTargetPath(blob.pathname);
    const url = blob.downloadUrl || blob.url;
    if (!url) continue;
    const blobResult = await blobGet(url, {
      access: "private",
      useCache: false,
    });
    const raw = blobResult
      ? await new Response(blobResult.stream).text()
      : await fetch(url, { cache: "no-store" }).then((response) => response.ok ? response.text() : "");
    if (!raw) throw new Error(`Could not read ${key}`);
    anonymizer.validateNoKnownNames(key, raw);
    if (raw.includes('"pdfData"')) {
      if (key.startsWith("pj_sub_") && !key.startsWith("pj_sub_meta_")) {
        finalPdfs += 1;
      } else {
      throw new Error(`PDF data field remains in ${key}`);
      }
    }
    checked += 1;
  }
  return { keys: blobs.length, checked, finalPdfs };
}

async function main() {
  await loadLocalEnv();

  const configRaw = await getValue(SOURCE_SCOPE, "pj_config");
  if (!configRaw) throw new Error("Source project1 config was not found.");
  const sourceConfig = parseStoredJson(configRaw, "pj_config");
  const anonymizer = buildAnonymizer(sourceConfig);

  if (VERIFY_ONLY) {
    const verified = await verifyTarget(anonymizer);
    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      verified,
      knownNames: anonymizer.knownNames.length,
    }, null, 2));
    return;
  }

  if (CLEAR_TARGET) {
    const targetKeys = await listKeys(TARGET_SCOPE);
    console.error(`Clearing ${targetKeys.length} existing project_expo keys...`);
    let cleared = 0;
    for (const key of targetKeys) {
      await storage(TARGET_SCOPE, { action: "set", key, value: "null" });
      cleared += 1;
      if (cleared % 10 === 0 || cleared === targetKeys.length) {
        console.error(`Cleared ${cleared}/${targetKeys.length}`);
      }
    }
  }

  const sourceKeys = await listKeys(SOURCE_SCOPE);
  const keys = Array.from(new Set(["pj_config", ...sourceKeys])).filter((key) => !shouldSkipKey(key));
  const copied = [];
  const skipped = sourceKeys.filter(shouldSkipKey);
  console.error(`Copying ${keys.length} keys (${skipped.length} skipped)...`);

  for (const [index, sourceKey] of keys.entries()) {
    console.error(`[${index + 1}/${keys.length}] ${sourceKey}`);
    const raw = await getValue(SOURCE_SCOPE, sourceKey);
    if (!raw) continue;
    const parsed = parseStoredJson(raw, sourceKey);
    const targetKey = anonymizer.sanitizeKey(sourceKey);
    const value = anonymizer.sanitizeValue(sourceKey, parsed);
    anonymizer.validateNoKnownNames(targetKey, value);
    await storage(TARGET_SCOPE, {
      action: "set",
      key: targetKey,
      value: JSON.stringify(value),
    });
    copied.push({ sourceKey, targetKey });
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    cleared: CLEAR_TARGET,
    copied: copied.length,
    skipped: skipped.length,
    knownNames: anonymizer.knownNames.length,
    includedFinalPdfs: INCLUDE_FINAL_PDFS,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
