/** Flow stages for a commenter progressing through the two-step follow-gate. */
export type FlowStage = 'AWAITING_FOLLOW_CONFIRMATION' | 'COMPLETED';

/** What the flow engine decided to do with a given comment event. */
export type ActionType =
  | 'STEP_1_REPLIED'
  | 'STEP_2_REPLIED'
  | 'NUDGE_SENT'
  | 'SKIPPED_OWN_COMMENT'
  | 'SKIPPED_ALREADY_PROCESSED'
  | 'SKIPPED_REEL_DISABLED'
  | 'SKIPPED_BLOCKLISTED'
  | 'SKIPPED_NO_OPEN_STATE'
  | 'IGNORED_MISMATCH'
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
  confirmationKeyword: string | null;
  step1Template: string | null;
  step2Template: string | null;
  nudgeTemplate: string | null;
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
  confirmationKeyword: string | null;
  step1Template: string | null;
  step2Template: string | null;
  nudgeTemplate: string | null;
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
