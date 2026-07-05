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

export type ReelConfigInput = {
  reelId: string;
  enabled?: boolean;
  triggerKeywords?: string[] | null;
  dmTemplate?: string | null;
  commentReplyTemplate?: string | null;
  blocklistKeywords?: string[] | null;
  detailedMessageContent?: string | null;
};
