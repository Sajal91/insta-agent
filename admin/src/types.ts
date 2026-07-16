export interface MessageLink {
  label: string;
  url: string;
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

export interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
  config: ReelConfig | null;
}

export interface LogEntry {
  id: string;
  commentId: string | null;
  igUserId: string | null;
  reelId: string | null;
  action: string;
  status: 'success' | 'skipped' | 'error';
  message: string | null;
  createdAt: string;
}

export interface Templates {
  DM_TEMPLATE?: string;
  COMMENT_REPLY_TEMPLATE?: string;
  DETAILED_MESSAGE_CONTENT?: string;
  DEFAULT_TRIGGER_KEYWORDS?: string;
  [key: string]: string | undefined;
}

export type UserRole = 'user' | 'admin';

export type SubscriptionStatus =
  | 'none'
  | 'created'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled';

export interface Subscription {
  status: SubscriptionStatus;
  razorpaySubscriptionId: string | null;
  razorpayCustomerId: string | null;
  planId: string | null;
  currentPeriodEnd: string | null;
  lastPaymentId: string | null;
  lastEventAt: string | null;
  updatedAt: string | null;
}

/** Statuses that grant automation access (active + retry grace). */
export function isSubscriptionActive(sub: Subscription | null | undefined): boolean {
  return sub ? sub.status === 'active' || sub.status === 'past_due' : false;
}

export interface BillingInfo {
  configured: boolean;
  keyId: string | null;
  pricing: { currency: string };
  subscription: Subscription;
}

export interface CredentialSummary {
  configured: boolean;
  businessAccountId: string | null;
  pageHandle: string | null;
  source: 'env' | 'stored' | 'none';
}

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  role: UserRole;
  credentials: CredentialSummary;
  subscription: Subscription;
  createdAt: string;
  updatedAt: string;
}

export type ReelConfigInput = {
  reelId: string;
  enabled?: boolean;
  triggerKeywords?: string[] | null;
  dmTemplate?: string | null;
  commentReplyTemplate?: string | null;
  blocklistKeywords?: string[] | null;
  detailedMessageContent?: string | null;
  links?: MessageLink[] | null;
};
