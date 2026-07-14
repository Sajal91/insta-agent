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

/**
 * A single call-to-action link rendered as a button in the DM. Instagram's
 * button template allows at most 3 buttons per message, and titles are capped
 * at ~20 characters.
 */
export interface MessageLink {
  /** Button label shown to the user, e.g. "Click me". */
  label: string;
  /** Destination URL (http/https). */
  url: string;
}

// ---- Multi-tenant: users & credentials ----

/** Platform role. Admins additionally manage users + credentials. */
export type UserRole = 'user' | 'admin';

/**
 * Automation-request lifecycle for a signed-up user:
 *   none      – signed up, has not requested the automation yet
 *   pending   – requested, awaiting admin review
 *   approved  – admin approved; user can operate their automation
 *   rejected  – admin declined the request
 */
export type AutomationStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** Fully-resolved Instagram credentials used to talk to the Graph API. */
export interface IgCredentials {
  appId: string;
  appSecret: string;
  accessToken: string;
  businessAccountId: string;
  pageHandle: string;
  verifyToken: string;
  graphApiVersion: string;
  graphBaseUrl: string;
}

/**
 * How credentials are persisted on a user document. The two genuinely sensitive
 * fields (appSecret, accessToken) are stored encrypted; the rest are plain so we
 * can query/route on them (businessAccountId, verifyToken).
 */
export interface StoredIgCredentials {
  appId: string;
  appSecretEnc: string;
  accessTokenEnc: string;
  businessAccountId: string;
  pageHandle: string;
  verifyToken: string;
  graphApiVersion: string;
  graphBaseUrl: string;
}

/** A signed-up (Google) user of the SaaS. _id is a Mongo ObjectId. */
export interface UserDoc {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  role: UserRole;
  status: AutomationStatus;
  requestNote: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  igCredentials: StoredIgCredentials | null;
  createdAt: string;
  updatedAt: string;
}

// ---- MongoDB document shapes ----

/** _id is the comment id. `ownerId` is the tenant (user) it belongs to. */
export interface ProcessedCommentDoc {
  _id: string;
  ownerId: string;
  processedAt: string;
}

/** _id is the reel (media) id (globally unique across Instagram). */
export interface ReelConfigDoc {
  _id: string;
  ownerId: string;
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
  /** CTA links sent as buttons in the DM (max 3). Empty = plain-text DM. */
  links: MessageLink[];
  createdAt: string;
  updatedAt: string;
}

export interface FlowStateDoc {
  ownerId: string;
  igUserId: string;
  commentId: string;
  reelId: string;
  stage: FlowStage;
  createdAt: string;
  updatedAt: string;
}

/** _id is `${ownerId}::${templateKey}`; the global default owner is a sentinel. */
export interface TemplateDoc {
  _id: string;
  ownerId: string;
  key: string;
  value: string;
  updatedAt: string;
}

export interface LogDoc {
  ownerId: string;
  commentId: string | null;
  igUserId: string | null;
  reelId: string | null;
  action: ActionType;
  status: LogStatus;
  message: string | null;
  createdAt: string;
}

// ---- API / domain shapes (what repositories return) ----

/** Whether a user currently has usable Instagram credentials configured. */
export interface CredentialSummary {
  configured: boolean;
  businessAccountId: string | null;
  pageHandle: string | null;
  source: 'env' | 'stored' | 'none';
}

/** A user as exposed over the API — never includes decrypted secrets. */
export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  role: UserRole;
  status: AutomationStatus;
  requestNote: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  credentials: CredentialSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ReelConfig {
  reelId: string;
  enabled: boolean;
  triggerKeywords: string[];
  dmTemplate: string | null;
  commentReplyTemplate: string | null;
  blocklistKeywords: string[];
  detailedMessageContent: string | null;
  links: MessageLink[];
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
