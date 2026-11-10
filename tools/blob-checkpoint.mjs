import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get, list } from "@vercel/blob";

function loadLocalEnv() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function listAllBlobs() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
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

loadLocalEnv();

const outputDir = process.argv[2] ? resolve(process.argv[2]) : null;
if (!outputDir) {
  console.error("Usage: node tools/blob-checkpoint.mjs <output-directory>");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not configured.");
  process.exit(1);
}

mkdirSync(resolve(outputDir, "blobs"), { recursive: true });
const blobs = await listAllBlobs();
const entries = new Array(blobs.length);
let completed = 0;

await mapLimit(blobs, 12, async (blob, index) => {
  const result = await get(blob.url, { access: "private", useCache: false });
  if (!result) throw new Error(`Blob not found: ${blob.pathname}`);
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  const file = `${String(index + 1).padStart(6, "0")}.bin`;
  writeFileSync(resolve(outputDir, "blobs", file), bytes);
  entries[index] = {
    file,
    pathname: blob.pathname,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentType: blob.contentType || "application/octet-stream",
    uploadedAt: blob.uploadedAt,
  };
  completed++;
  if (completed % 100 === 0 || completed === blobs.length) {
    console.log(`Downloaded ${completed}/${blobs.length}`);
  }
});

const manifest = {
  schema: "feedforward-vercel-blob-checkpoint-v1",
  createdAt: new Date().toISOString(),
  blobCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
  entries,
};
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ blobCount: manifest.blobCount, totalBytes: manifest.totalBytes }));
