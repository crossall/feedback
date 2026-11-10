"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  CornerDownRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  GUESTBOOK_MESSAGE_MAX,
  type GuestbookEntry,
  type GuestbookEntryKind,
  type GuestbookListResponse,
} from "@/lib/showcase-guestbook";

import styles from "./content.module.css";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Feedback = { tone: "success" | "error"; message: string } | null;
type AdminAction = "reply" | "show" | "hide" | "delete";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

async function readResponse<T>(response: Response) {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export function ShowcaseGuestbook() {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [kind, setKind] = useState<GuestbookEntryKind>("guestbook");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminEntries, setAdminEntries] = useState<GuestbookEntry[] | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<Feedback>(null);
  const [adminPendingId, setAdminPendingId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const startedAt = useRef(0);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  const loadAdminEntries = useCallback(async () => {
    const response = await fetch("/api/showcase/guestbook?scope=admin", { cache: "no-store" });
    const data = await readResponse<GuestbookListResponse>(response);
    setAdminEntries(data.entries);
    setReplyDrafts(Object.fromEntries(data.entries.map((entry) => [entry.id, entry.reply?.message || ""])));
    return data;
  }, []);

  const loadEntries = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/showcase/guestbook", { cache: "no-store" });
      const data = await readResponse<GuestbookListResponse>(response);
      setEntries(data.entries);
      setAdminEnabled(data.adminEnabled);
      setAdminAuthenticated(data.admin);
      if (data.admin) await loadAdminEntries();
      else setAdminEntries(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "방명록을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAdminEntries]);

  useEffect(() => {
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => void loadEntries(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEntries]);

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/showcase/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          nickname,
          message,
          consent,
          website,
          startedAt: startedAt.current,
        }),
      });
      const data = await readResponse<{ ok: true; entry: GuestbookEntry | null }>(response);
      const newEntry = data.entry;
      if (newEntry?.status === "published") setEntries((current) => [newEntry, ...current]);
      setMessage("");
      setConsent(false);
      startedAt.current = Date.now();
      setFeedback({ tone: "success", message: "글을 접수했습니다. 운영자 확인 후 공개됩니다." });
      window.requestAnimationFrame(() => feedbackRef.current?.focus());
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "글을 남기지 못했습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function openAdmin() {
    if (!adminPassword.trim()) {
      setAdminFeedback({ tone: "error", message: "운영자 비밀번호를 입력해 주세요." });
      return;
    }

    setAdminLoading(true);
    setAdminFeedback(null);
    try {
      const response = await fetch("/api/showcase/guestbook/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      await readResponse<{ ok: true; admin: true }>(response);
      setAdminPassword("");
      await loadEntries(true);
      setAdminFeedback({ tone: "success", message: "운영자 관리 화면을 열었습니다." });
    } catch (error) {
      setAdminEntries(null);
      setAdminFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "관리 화면을 열지 못했습니다.",
      });
    } finally {
      setAdminLoading(false);
    }
  }

  async function closeAdmin() {
    setAdminLoading(true);
    setAdminFeedback(null);
    try {
      const response = await fetch("/api/showcase/guestbook/admin", { method: "DELETE" });
      await readResponse<{ ok: true }>(response);
      setAdminAuthenticated(false);
      setAdminEntries(null);
      setReplyDrafts({});
      setAdminFeedback({ tone: "success", message: "운영자 화면에서 나왔습니다." });
    } catch (error) {
      setAdminFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "로그아웃하지 못했습니다.",
      });
    } finally {
      setAdminLoading(false);
    }
  }

  async function runAdminAction(entry: GuestbookEntry, action: AdminAction) {
    if (action === "delete" && !window.confirm("이 글을 완전히 삭제할까요?")) return;

    setAdminPendingId(entry.id);
    setAdminFeedback(null);
    try {
      const response = await fetch("/api/showcase/guestbook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action, reply: replyDrafts[entry.id] || "" }),
      });
      await readResponse<{ ok: true }>(response);
      await loadEntries(true);
      setAdminFeedback({
        tone: "success",
        message: action === "reply" ? "답변을 저장했습니다." : action === "delete" ? "글을 삭제했습니다." : "공개 상태를 바꿨습니다.",
      });
    } catch (error) {
      setAdminFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "관리 동작을 처리하지 못했습니다.",
      });
    } finally {
      setAdminPendingId(null);
    }
  }

  return (
    <div className={styles.embedShell}>
      <div className={styles.embedBar} aria-hidden="true">
        <span /><span /><span /><small>LIVE Q&amp;A</small>
      </div>
      <div className={styles.guestbookBoard}>
        <div className={styles.guestbookBoardHeader}>
          <div>
            <small>VISITOR NOTES</small>
            <h3>생각과 질문을 남겨 주세요</h3>
          </div>
          <button
            className={styles.guestbookRefresh}
            type="button"
            onClick={() => void loadEntries(true)}
            disabled={refreshing}
            aria-label="방명록 새로고침"
          >
            <RefreshCw aria-hidden="true" className={refreshing ? styles.isSpinning : undefined} />
            새로고침
          </button>
        </div>

        <form className={styles.guestbookForm} onSubmit={submitEntry}>
          <fieldset className={styles.guestbookKind}>
            <legend>글 종류</legend>
            <label>
              <input type="radio" name="guestbook-kind" value="guestbook" checked={kind === "guestbook"} onChange={() => setKind("guestbook")} />
              <span>방명록</span>
            </label>
            <label>
              <input type="radio" name="guestbook-kind" value="question" checked={kind === "question"} onChange={() => setKind("question")} />
              <span>질문</span>
            </label>
          </fieldset>

          <div className={styles.guestbookFields}>
            <label className={styles.guestbookField}>
              <span>별명</span>
              <input
                name="nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="예: 과학을 좋아하는 교사"
                required
              />
            </label>
            <label className={`${styles.guestbookField} ${styles.guestbookMessageField}`}>
              <span>내용</span>
              <textarea
                name="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={GUESTBOOK_MESSAGE_MAX}
                rows={4}
                aria-describedby="guestbook-writing-guide guestbook-character-count"
                placeholder={kind === "question" ? "궁금한 점을 남겨 주세요." : "발표회를 본 소감을 남겨 주세요."}
                required
              />
            </label>
          </div>

          <label className={styles.guestbookHoneypot} aria-hidden="true">
            웹사이트
            <input name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
          </label>

          <div className={styles.guestbookFormMeta}>
            <label className={styles.guestbookConsent}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
              <span id="guestbook-writing-guide">학생 실명·학년·반·연락처 없이 공개 가능한 내용만 씁니다.</span>
            </label>
            <span id="guestbook-character-count">{message.length}/{GUESTBOOK_MESSAGE_MAX}</span>
          </div>

          <button className={styles.guestbookSubmit} type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle aria-hidden="true" className={styles.isSpinning} /> : <Send aria-hidden="true" />}
            {submitting ? "저장하는 중" : "글 남기기"}
          </button>
          {feedback && (
            <p
              ref={feedbackRef}
              className={feedback.tone === "success" ? styles.guestbookSuccess : styles.guestbookError}
              role={feedback.tone === "error" ? "alert" : "status"}
              tabIndex={-1}
            >
              {feedback.message}
            </p>
          )}
        </form>

        <div className={styles.guestbookListHeader}>
          <h4>도착한 이야기 <span>{entries.length}</span></h4>
          <p>최근 글부터 보여 드립니다.</p>
        </div>

        <div className={styles.guestbookList} aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className={styles.guestbookEmpty}>
              <LoaderCircle aria-hidden="true" className={styles.isSpinning} />
              <p>이야기를 불러오는 중입니다.</p>
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.guestbookEmpty}>
              <MessageCircleQuestion aria-hidden="true" />
              <p>아직 도착한 글이 없습니다.<br />첫 번째 이야기를 남겨 주세요.</p>
            </div>
          ) : (
            <ol>
              {entries.slice(0, visibleCount).map((entry) => (
                <li key={entry.id}>
                  <article className={styles.guestbookEntry}>
                    <header>
                      <span data-kind={entry.kind}>{entry.kind === "question" ? "질문" : "방명록"}</span>
                      <strong>{entry.nickname}</strong>
                      <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                    </header>
                    <p>{entry.message}</p>
                    {entry.reply && (
                      <div className={styles.guestbookReply} aria-label="운영자 답변">
                        <CornerDownRight aria-hidden="true" />
                        <div><strong>마포초 운영자</strong><p>{entry.reply.message}</p></div>
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>

        {visibleCount < entries.length && (
          <button className={styles.guestbookMore} type="button" onClick={() => setVisibleCount((count) => count + 6)}>
            이야기 더 보기
          </button>
        )}

        {adminEnabled && (
          <details className={styles.guestbookAdmin}>
            <summary><LockKeyhole aria-hidden="true" /> 운영자 답변·관리</summary>
            <div className={styles.guestbookAdminBody}>
              {!adminAuthenticated ? (
                <div className={styles.guestbookAdminLogin}>
                  <label>
                    <span>운영자 비밀번호</span>
                    <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" />
                  </label>
                  <button type="button" onClick={() => void openAdmin()} disabled={adminLoading}>
                    {adminLoading ? <LoaderCircle aria-hidden="true" className={styles.isSpinning} /> : <ShieldCheck aria-hidden="true" />}
                    관리 화면 열기
                  </button>
                </div>
              ) : (
                <div className={styles.guestbookAdminToolbar}>
                  <p><ShieldCheck aria-hidden="true" /> 운영자로 로그인했습니다.</p>
                  <button type="button" onClick={() => void closeAdmin()} disabled={adminLoading}>
                    <LogOut aria-hidden="true" /> 로그아웃
                  </button>
                </div>
              )}
              {adminFeedback && (
                <p className={adminFeedback.tone === "success" ? styles.guestbookSuccess : styles.guestbookError} role={adminFeedback.tone === "error" ? "alert" : "status"}>
                  {adminFeedback.message}
                </p>
              )}
              {adminAuthenticated && adminEntries && (
                <div className={styles.guestbookAdminList}>
                  {adminEntries.map((entry) => (
                    <article key={entry.id} className={styles.guestbookAdminEntry}>
                      <header>
                        <strong>{entry.nickname}</strong>
                        <span>{entry.status === "published" ? "공개 중" : entry.status === "pending" ? "검토 대기" : "숨김"}</span>
                      </header>
                      <p>{entry.message}</p>
                      <label>
                        <span>운영자 답변</span>
                        <textarea
                          rows={3}
                          maxLength={500}
                          value={replyDrafts[entry.id] ?? ""}
                          onChange={(event) => setReplyDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                        />
                      </label>
                      <div className={styles.guestbookAdminActions}>
                        <button type="button" onClick={() => void runAdminAction(entry, "reply")} disabled={adminPendingId === entry.id}>답변 저장</button>
                        <button type="button" onClick={() => void runAdminAction(entry, entry.status === "published" ? "hide" : "show")} disabled={adminPendingId === entry.id}>
                          {entry.status === "published" ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                          {entry.status === "published" ? "숨기기" : "공개하기"}
                        </button>
                        <button type="button" onClick={() => void runAdminAction(entry, "delete")} disabled={adminPendingId === entry.id}>
                          <Trash2 aria-hidden="true" /> 삭제
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
