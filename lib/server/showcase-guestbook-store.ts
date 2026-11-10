import "server-only";

import { BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";

import type {
  GuestbookEntry,
  GuestbookEntryKind,
  GuestbookEntryStatus,
  GuestbookReply,
} from "@/lib/showcase-guestbook";

const ENTRY_PREFIX = "showcase/guestbook/entries/";
const ENTRY_PAGE_SIZE = 250;
const ENTRY_MAX = 1_000;

type GuestbookEntryRecord = {
  entry: GuestbookEntry;
  etag: string;
};

function entryPath(id: string) {
  return `${ENTRY_PREFIX}${id}.json`;
}

function isEntryKind(value: unknown): value is GuestbookEntryKind {
  return value === "guestbook" || value === "question";
}

function isEntryStatus(value: unknown): value is GuestbookEntryStatus {
  return value === "pending" || value === "published" || value === "hidden";
}

function parseEntry(value: unknown): GuestbookEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GuestbookEntry>;
  if (
    typeof candidate.id !== "string" ||
    !isEntryKind(candidate.kind) ||
    typeof candidate.nickname !== "string" ||
    typeof candidate.message !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !isEntryStatus(candidate.status)
  ) {
    return null;
  }

  let reply: GuestbookReply | undefined;
  if (candidate.reply) {
    if (
      typeof candidate.reply.message !== "string" ||
      typeof candidate.reply.createdAt !== "string"
    ) {
      return null;
    }
    reply = candidate.reply;
  }

  return {
    id: candidate.id,
    kind: candidate.kind,
    nickname: candidate.nickname,
    message: candidate.message,
    createdAt: candidate.createdAt,
    status: candidate.status,
    ...(reply ? { reply } : {}),
  };
}

async function readBlob(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;

  try {
    const entry = parseEntry(JSON.parse(await new Response(result.stream).text()));
    return entry ? { entry, etag: result.blob.etag } satisfies GuestbookEntryRecord : null;
  } catch {
    return null;
  }
}

export async function listGuestbookEntries(includeHidden = false) {
  const pathnames: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await list({
      prefix: ENTRY_PREFIX,
      limit: Math.min(ENTRY_PAGE_SIZE, ENTRY_MAX - pathnames.length),
      ...(cursor ? { cursor } : {}),
    });
    pathnames.push(...result.blobs.map((blob) => blob.pathname));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor && pathnames.length < ENTRY_MAX);

  const records = await Promise.all(pathnames.map((pathname) => readBlob(pathname)));

  return records
    .filter((record): record is GuestbookEntryRecord => Boolean(record))
    .map((record) => record.entry)
    .filter((entry) => includeHidden || entry.status === "published")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getGuestbookEntry(id: string) {
  return readBlob(entryPath(id));
}

export async function createGuestbookEntry(entry: GuestbookEntry) {
  await put(entryPath(entry.id), JSON.stringify(entry), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return entry;
}

export async function updateGuestbookEntry(entry: GuestbookEntry, etag: string) {
  await put(entryPath(entry.id), JSON.stringify(entry), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    ifMatch: etag,
  });
  return entry;
}

export async function deleteGuestbookEntry(id: string, etag: string) {
  await del(entryPath(id), { ifMatch: etag });
}

export function isGuestbookWriteConflict(error: unknown) {
  return error instanceof BlobPreconditionFailedError;
}
