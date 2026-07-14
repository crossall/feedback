import { del, get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const basePath = "meta1/storage/shared/";

function safeKey(value: unknown) {
  const key = String(value ?? "").trim();
  if (!key || key.length > 240) throw new Error("저장소 키를 확인해 주세요.");
  return key;
}

function blobPath(key: string) {
  return `${basePath}${encodeURIComponent(key)}.json`;
}

function legacyBlobPath(key: string) {
  return `${basePath}${key}.json`;
}

function keyFromPath(pathname: string) {
  const encoded = pathname.slice(basePath.length).replace(/\.json$/, "");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function readValue(key: string) {
  const canonicalPath = blobPath(key);
  const legacyPath = legacyBlobPath(key);
  let result = await get(canonicalPath, {
    access: "private",
    useCache: false,
  });
  if (!result && legacyPath !== canonicalPath) {
    result = await get(legacyPath, {
      access: "private",
      useCache: false,
    });
  }
  if (!result) return null;
  return { value: await new Response(result.stream).text() };
}

async function readValueFromListedBlob(key: string) {
  const stablePrefix = key.includes("::") ? key.slice(0, key.indexOf("::")) : key;
  const prefixes = Array.from(new Set([
    `${basePath}${encodeURIComponent(stablePrefix)}`,
    `${basePath}${stablePrefix}`,
  ]));

  for (const prefix of prefixes) {
    const result = await list({ prefix });
    const blob = result.blobs.find((item) => keyFromPath(item.pathname) === key);
    const url = blob?.downloadUrl || blob?.url;
    if (!url) continue;
    const blobResult = await get(url, {
      access: "private",
      useCache: false,
    });
    if (blobResult) return { value: await new Response(blobResult.stream).text() };
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) return { value: await response.text() };
  }
  return null;
}

async function writePathFor(key: string) {
  const canonicalPath = blobPath(key);
  const legacyPath = legacyBlobPath(key);
  if (legacyPath === canonicalPath) return canonicalPath;
  const legacy = await get(legacyPath, {
    access: "private",
    useCache: false,
  });
  return legacy ? legacyPath : canonicalPath;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: "get" | "set" | "list";
      key?: string;
      prefix?: string;
      value?: string;
    };

    if (body.action === "get") {
      const key = safeKey(body.key);
      return NextResponse.json(await readValue(key) || await readValueFromListedBlob(key));
    }

    if (body.action === "set") {
      const key = safeKey(body.key);
      const value = typeof body.value === "string" ? body.value : "null";
      if (value === "null") {
        await Promise.allSettled([
          del(blobPath(key)),
          legacyBlobPath(key) !== blobPath(key) ? del(legacyBlobPath(key)) : Promise.resolve(),
        ]);
        return NextResponse.json({ ok: true });
      }
      await put(await writePathFor(key), value, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "list") {
      const prefix = String(body.prefix ?? "");
      const result = await list({
        prefix: `${basePath}${encodeURIComponent(prefix)}`,
      });
      return NextResponse.json({
        keys: result.blobs.map((blob) => keyFromPath(blob.pathname)),
      });
    }

    return NextResponse.json({ error: "저장소 동작을 확인해 주세요." }, { status: 400 });
  } catch (error) {
    console.error("Meta1 storage request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로젝트 저장소 요청에 실패했습니다." },
      { status: 500 },
    );
  }
}
