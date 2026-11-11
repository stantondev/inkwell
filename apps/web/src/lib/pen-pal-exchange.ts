// The pen pal exchange: types shared by the Letterbox card, the Pen Pals
// page and the thread's letter of introduction.

export interface ExchangeUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
}

export interface ExchangeStatus {
  state: "idle" | "waiting" | "introduced";
  can_join: boolean;
  /** Why not, when can_join is false: "waiting" | "no_entry" | "unavailable" | "write_first". */
  reason: string | null;
  /** The line you last wrote about yourself. */
  note: string | null;
  waiting_since: string | null;
  rejoin_after_days: number;
  introduction: {
    conversation_id: string;
    introduced_at: string;
    other_user: ExchangeUser;
    /** You've written to them since being introduced. */
    written: boolean;
    /** They've written to you. */
    heard_back: boolean;
  } | null;
}

/** What the thread shows above the letters of two people Inkwell introduced. */
export interface ThreadIntroduction {
  introduced_at: string;
  my_note: string | null;
  their_note: string | null;
  their_latest_entry: { title: string | null; excerpt: string | null; path: string; published_at: string } | null;
  their_member_since: string | null;
}

export const EXCHANGE_NOTE_MAX = 200;
