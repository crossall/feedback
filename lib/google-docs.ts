const googleDocIdPattern = /^[a-zA-Z0-9_-]{20,}$/;
const maxDocumentCharacters = 100_000;

export function getGoogleDocId(input: string) {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("올바른 Google Docs 주소를 입력해 주세요.");
  }

  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("docs.google.com의 Google Docs 주소만 사용할 수 있어요.");
  }

  const documentId = url.pathname.match(/^\/document\/d\/([^/]+)/)?.[1] ?? "";
  if (!googleDocIdPattern.test(documentId)) {
    throw new Error("Google Docs 문서 주소를 확인해 주세요.");
  }

  return documentId;
}

export async function fetchGoogleDocText(input: string) {
  const documentId = getGoogleDocId(input);
  const response = await fetch(
    `https://docs.google.com/document/d/${documentId}/export?format=txt`,
    {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Leafback Google Docs Evaluator" },
    },
  );

  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) {
      throw new Error("문서를 읽을 수 없어요. 공유 설정을 '링크가 있는 모든 사용자에게 공개'로 바꿔 주세요.");
    }
    throw new Error("Google Docs 문서를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/plain")) {
    throw new Error("문서를 읽을 수 없어요. Google Docs 공유 설정을 확인해 주세요.");
  }

  const text = (await response.text()).replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("문서에 평가할 글이 없어요.");
  if (text.length > maxDocumentCharacters) {
    throw new Error("문서가 너무 길어요. 10만 자 이하의 문서를 제출해 주세요.");
  }

  return text;
}
