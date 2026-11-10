export const GUESTBOOK_NICKNAME_MAX = 20;
export const GUESTBOOK_MESSAGE_MAX = 500;
export const GUESTBOOK_REPLY_MAX = 500;

export type GuestbookEntryKind = "guestbook" | "question";
export type GuestbookEntryStatus = "pending" | "published" | "hidden";

export type GuestbookReply = {
  message: string;
  createdAt: string;
};

export type GuestbookEntry = {
  id: string;
  kind: GuestbookEntryKind;
  nickname: string;
  message: string;
  createdAt: string;
  status: GuestbookEntryStatus;
  reply?: GuestbookReply;
};

export type GuestbookListResponse = {
  entries: GuestbookEntry[];
  admin: boolean;
  adminEnabled: boolean;
};
