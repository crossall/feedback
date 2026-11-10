import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { del, list, put } from "@vercel/blob";

function loadLocalEnv() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

async function listAllBlobs() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

loadLocalEnv();

const checkpointDir = process.argv[2] ? resolve(process.argv[2]) : null;
const confirmed = process.argv.includes("--confirm-restore");
const deleteExtra = process.argv.includes("--delete-extra");
if (!checkpointDir || !confirmed) {
  console.error("Usage: node tools/blob-restore.mjs <checkpoint-directory> --confirm-restore [--delete-extra]");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not configured.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(checkpointDir, "manifest.json"), "utf8"));
if (manifest.schema !== "feedforward-vercel-blob-checkpoint-v1") {
  throw new Error("Unsupported checkpoint manifest.");
}

let restored = 0;
await mapLimit(manifest.entries, 8, async (entry) => {
  const bytes = readFileSync(resolve(checkpointDir, "blobs", entry.file));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.pathname}`);
  await put(entry.pathname, bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: entry.contentType,
  });
  restored++;
  if (restored % 100 === 0 || restored === manifest.entries.length) {
    console.log(`Restored ${restored}/${manifest.entries.length}`);
  }
});

if (deleteExtra) {
  const expected = new Set(manifest.entries.map((entry) => entry.pathname));
  const extras = (await listAllBlobs()).filter((blob) => !expected.has(blob.pathname));
  if (extras.length) await del(extras.map((blob) => blob.url));
  console.log(`Deleted ${extras.length} blobs created after the checkpoint.`);
}

console.log("Blob restore completed.");
