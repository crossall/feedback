import { del, get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";
import { getProjectInstanceById } from "@/lib/server/project-instance-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const legacyBasePath = "project1/storage/shared/";

function safeKey(value: unknown) {
  const key = String(value ?? "").trim();
  if (!key || key.length > 240) throw new Error("저장소 키를 확인해 주세요.");
  return key;
}

function blobPath(basePath: string, key: string) {
  return `${basePath}${encodeURIComponent(key)}.json`;
}

function legacyBlobPath(basePath: string, key: string) {
  return `${basePath}${key}.json`;
}

function keyFromPath(basePath: string, pathname: string) {
  const encoded = pathname.slice(basePath.length).replace(/\.json$/, "");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function readValue(basePath: string, key: string) {
  const canonicalPath = blobPath(basePath, key);
  const legacyPath = legacyBlobPath(basePath, key);
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

async function readValueFromListedBlob(basePath: string, key: string) {
  const stablePrefix = key.includes("::") ? key.slice(0, key.indexOf("::")) : key;
  const prefixes = Array.from(new Set([
    `${basePath}${encodeURIComponent(stablePrefix)}`,
    `${basePath}${stablePrefix}`,
  ]));

  for (const prefix of prefixes) {
    const result = await list({ prefix });
    const blob = result.blobs.find((item) => keyFromPath(basePath, item.pathname) === key);
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

async function writePathFor(basePath: string, key: string) {
  const canonicalPath = blobPath(basePath, key);
  const legacyPath = legacyBlobPath(basePath, key);
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
      instanceId?: string;
    };
    const instance = body.instanceId
      ? await getProjectInstanceById(body.instanceId, "project1")
      : null;
    if (body.instanceId && !instance) {
      return NextResponse.json({ error: "프로젝트 주소를 확인해 주세요." }, { status: 404 });
    }
    const basePath = instance
      ? `project-instances/${instance.teacherId}/${instance.slug}/project1/storage/shared/`
      : legacyBasePath;

    if (body.action === "get") {
      const key = safeKey(body.key);
      return NextResponse.json(await readValue(basePath, key) || await readValueFromListedBlob(basePath, key));
    }

    if (body.action === "set") {
      const key = safeKey(body.key);
      if (
        instance
        && ["pj_config", "pj_teacher_auth", "pj_student_stage_control"].includes(key)
        && !await isTeacherSessionFor(instance.teacherId)
      ) {
        return NextResponse.json({ error: "이 프로젝트의 교사 로그인이 필요합니다." }, { status: 401 });
      }
      const value = typeof body.value === "string" ? body.value : "null";
      if (value === "null") {
        await Promise.allSettled([
          del(blobPath(basePath, key)),
          legacyBlobPath(basePath, key) !== blobPath(basePath, key)
            ? del(legacyBlobPath(basePath, key))
            : Promise.resolve(),
        ]);
        return NextResponse.json({ ok: true });
      }
      await put(await writePathFor(basePath, key), value, {
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
        keys: result.blobs.map((blob) => keyFromPath(basePath, blob.pathname)),
      });
    }

    return NextResponse.json({ error: "저장소 동작을 확인해 주세요." }, { status: 400 });
  } catch (error) {
    console.error("Project1 storage request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로젝트 저장소 요청에 실패했습니다." },
      { status: 500 },
    );
  }
}
