/**
 * We record a state row once details have been delivered to a commenter (useful
 * for the /flows debugging endpoint and as a per-user history).
 */
export type FlowStage = 'COMPLETED';

/** What the flow engine decided to do with a given comment event. */
export type ActionType =
  | 'DM_SENT'
  | 'COMMENT_REPLIED'
  | 'DETAILS_SENT'
  | 'SKIPPED_OWN_COMMENT'
  | 'SKIPPED_ALREADY_PROCESSED'
  | 'SKIPPED_REEL_DISABLED'
  | 'SKIPPED_BLOCKLISTED'
  | 'SKIPPED_NO_KEYWORD'
  | 'SKIPPED_NO_CONFIG'
  | 'SKIPPED_NOT_ENABLED'
  | 'SKIPPED_REPLY'
  | 'ERRORED';

export type LogStatus = 'success' | 'skipped' | 'error';

// ---- MongoDB document shapes ----

/** _id is the comment id. */
export interface ProcessedCommentDoc {
  _id: string;
  processedAt: string;
}

/** _id is the reel (media) id. */
export interface ReelConfigDoc {
  _id: string;
  enabled: boolean;
  /**
   * Comments must contain one of these (case-insensitive) to trigger the DM.
   * Empty array = no keyword gate (reply to every comment).
   */
  triggerKeywords: string[];
  dmTemplate: string | null;
  commentReplyTemplate: string | null;
  blocklistKeywords: string[];
  detailedMessageContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowStateDoc {
  igUserId: string;
  commentId: string;
  reelId: string;
  stage: FlowStage;
  createdAt: string;
  updatedAt: string;
}

/** _id is the template key. */
export interface TemplateDoc {
  _id: string;
  value: string;
  updatedAt: string;
}

/**
 * The single admin login account. _id is the (lowercased) email; only the
 * scrypt password hash is stored — never the plaintext.
 */
export interface AdminUserDoc {
  _id: string;
  passwordHash: string;
  updatedAt: string;
}

export interface LogDoc {
  commentId: string | null;
  igUserId: string | null;
  reelId: string | null;
  action: ActionType;
  status: LogStatus;
  message: string | null;
  createdAt: string;
}

// ---- API / domain shapes (what repositories return) ----

export interface ReelConfig {
  reelId: string;
  enabled: boolean;
  triggerKeywords: string[];
  dmTemplate: string | null;
  commentReplyTemplate: string | null;
  blocklistKeywords: string[];
  detailedMessageContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowState {
  igUserId: string;
  commentId: string;
  reelId: string;
  stage: FlowStage;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  commentId: string | null;
  igUserId: string | null;
  reelId: string | null;
  action: ActionType;
  status: LogStatus;
  message: string | null;
  createdAt: string;
}
