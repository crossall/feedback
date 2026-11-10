import "server-only";

import { del, get, list, put } from "@vercel/blob";
import {
  isProjectTemplateId,
  projectInstanceId,
  type ProjectInstance,
  type ProjectTemplateId,
} from "@/lib/project-instances";
import {
  normalizeProject4Config,
  project4DefaultConfig,
  project4DefaultCriteria,
  type Project4Config,
} from "@/lib/project4";

const rootPath = "project-instances/";

function instanceRoot(teacherId: string, slug: string) {
  return `${rootPath}${teacherId}/${slug}/`;
}

function metadataPath(teacherId: string, slug: string) {
  return `${instanceRoot(teacherId, slug)}instance.json`;
}

async function readJson<T>(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  return result ? await new Response(result.stream).json() as T : null;
}

async function writeJson(path: string, value: unknown) {
  await put(path, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export function normalizeProjectSlug(value: string) {
  return value
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("ko")
    .replace(/\s+/g, "-")
    .replace(/[^0-9a-z가-힣_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 48);
}

export async function getProjectInstance(teacherId: string, slug: string) {
  if (!/^\d{4}$/.test(teacherId) || normalizeProjectSlug(slug) !== slug) return null;
  const value = await readJson<ProjectInstance>(metadataPath(teacherId, slug));
  if (!value || value.teacherId !== teacherId || value.slug !== slug || !isProjectTemplateId(value.template)) {
    return null;
  }
  return value;
}

export async function getProjectInstanceById(value: unknown, template: ProjectTemplateId) {
  const match = String(value ?? "").match(/^(\d{4})\/([^/]+)$/);
  if (!match) return null;
  const instance = await getProjectInstance(match[1], match[2]);
  return instance?.template === template ? instance : null;
}

export async function listProjectInstances(teacherId: string) {
  if (!/^\d{4}$/.test(teacherId)) return [];
  const result = await list({ prefix: `${rootPath}${teacherId}/` });
  const metadata = result.blobs.filter((blob) => blob.pathname.endsWith("/instance.json"));
  const items = await Promise.all(metadata.map((blob) => readJson<ProjectInstance>(blob.pathname)));
  return items
    .filter((item): item is ProjectInstance => Boolean(item && item.teacherId === teacherId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function readLegacyProject1Config() {
  const path = `project1/storage/shared/${encodeURIComponent("pj_config")}.json`;
  const result = await get(path, { access: "private", useCache: false });
  if (!result) return null;
  try {
    return JSON.parse(await new Response(result.stream).text()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function initializeProject1(instance: ProjectInstance) {
  const source = await readLegacyProject1Config();
  const config: Record<string, unknown> = {
    ...(source?.project ? { project: source.project } : {}),
    ...(source?.settings ? { settings: source.settings } : {}),
    ...(instance.copiedRubric && source?.rubric ? { rubric: source.rubric } : {}),
    classes: [],
    groups: [],
  };
  await put(
    `${instanceRoot(instance.teacherId, instance.slug)}project1/storage/shared/${encodeURIComponent("pj_config")}.json`,
    JSON.stringify(config),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    },
  );
}

async function initializeProject4(instance: ProjectInstance) {
  const source = normalizeProject4Config(
    await readJson<Project4Config>("project4/config.json") || project4DefaultConfig,
  );
  const config = normalizeProject4Config({
    ...source,
    openStage: 1,
    groupReviewOpen: false,
    juniorEvaluation: { open: false, classMappings: [] },
    criteria: instance.copiedRubric ? source.criteria : [...project4DefaultCriteria],
    classes: [],
    groups: [],
  });
  await writeJson(`${instanceRoot(instance.teacherId, instance.slug)}project4/config.json`, config);
}

export async function createProjectInstance(input: {
  teacherId: string;
  name: string;
  template: ProjectTemplateId;
  copyRubric: boolean;
}) {
  const name = input.name.trim().normalize("NFC").slice(0, 50);
  const slug = normalizeProjectSlug(name);
  if (name.length < 2 || slug.length < 2) throw new Error("주소 이름을 두 글자 이상 입력해 주세요.");
  if (await getProjectInstance(input.teacherId, slug)) {
    throw new Error("같은 주소 이름을 이미 사용하고 있습니다. 다른 이름을 입력해 주세요.");
  }
  const now = new Date().toISOString();
  const instance: ProjectInstance = {
    id: projectInstanceId(input.teacherId, slug),
    teacherId: input.teacherId,
    slug,
    name,
    template: input.template,
    copiedRubric: input.copyRubric,
    createdAt: now,
    updatedAt: now,
  };
  if (input.template === "project1") await initializeProject1(instance);
  else await initializeProject4(instance);
  await writeJson(metadataPath(instance.teacherId, instance.slug), instance);
  return instance;
}

export async function deleteProjectInstance(teacherId: string, instanceId: string) {
  const instance = await getProjectInstanceById(instanceId, "project1")
    || await getProjectInstanceById(instanceId, "project4");
  if (!instance || instance.teacherId !== teacherId) {
    throw new Error("삭제할 프로젝트를 확인해 주세요.");
  }
  const prefix = instanceRoot(instance.teacherId, instance.slug);
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await list({ prefix, cursor });
    paths.push(...result.blobs.map((blob) => blob.pathname));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  if (paths.length > 0) await del(paths);
}
