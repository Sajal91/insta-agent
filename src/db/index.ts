import { MongoClient, type Db, type Collection } from 'mongodb';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { hashPassword, verifyPassword } from '../utils/password';
import type {
  AdminUserDoc,
  FlowStateDoc,
  LogDoc,
  ProcessedCommentDoc,
  ReelConfigDoc,
  TemplateDoc,
} from './types';

/**
 * Single shared MongoDB client/connection for the process. Connection is opened
 * once at boot via connectDb(); repositories then grab collections through the
 * typed getters below.
 */
let client: MongoClient | null = null;
let db: Db | null = null;

export const COLLECTIONS = {
  processedComments: 'processed_comments',
  reelConfigs: 'reel_configs',
  flowStates: 'flow_states',
  templates: 'templates',
  logs: 'logs',
  adminUsers: 'admin_users',
} as const;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  db = client.db(config.MONGODB_DB);

  await ensureIndexes(db);
  await seedDefaultTemplates(db);
  await seedAdminUser(db);

  logger.info({ db: config.MONGODB_DB }, 'MongoDB connected');
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectDb() first.');
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/** Typed collection accessors so repositories stay strongly typed. */
export const collections = {
  processedComments(): Collection<ProcessedCommentDoc> {
    return getDb().collection<ProcessedCommentDoc>(COLLECTIONS.processedComments);
  },
  reelConfigs(): Collection<ReelConfigDoc> {
    return getDb().collection<ReelConfigDoc>(COLLECTIONS.reelConfigs);
  },
  flowStates(): Collection<FlowStateDoc> {
    return getDb().collection<FlowStateDoc>(COLLECTIONS.flowStates);
  },
  templates(): Collection<TemplateDoc> {
    return getDb().collection<TemplateDoc>(COLLECTIONS.templates);
  },
  logs(): Collection<LogDoc> {
    return getDb().collection<LogDoc>(COLLECTIONS.logs);
  },
  adminUsers(): Collection<AdminUserDoc> {
    return getDb().collection<AdminUserDoc>(COLLECTIONS.adminUsers);
  },
};

async function ensureIndexes(database: Db): Promise<void> {
  // One open flow per (user, reel).
  await database
    .collection(COLLECTIONS.flowStates)
    .createIndex({ igUserId: 1, reelId: 1 }, { unique: true });
  await database.collection(COLLECTIONS.flowStates).createIndex({ igUserId: 1 });
  await database.collection(COLLECTIONS.flowStates).createIndex({ stage: 1 });

  // Logs are read newest-first and filtered by comment.
  await database.collection(COLLECTIONS.logs).createIndex({ createdAt: -1 });
  await database.collection(COLLECTIONS.logs).createIndex({ commentId: 1 });
}

/**
 * Seed the default global templates only if missing (never clobber edits made
 * via PUT /templates). Uses _id = template key. Also removes obsolete keys from
 * the previous two-step follow-gate design.
 */
async function seedDefaultTemplates(database: Db): Promise<void> {
  const defaults: Record<string, string> = {
    DM_TEMPLATE:
      `Hi! 👋

Thanks for your interest in our WhatsApp AI Agent.

You can book a free demo here:
[Your Demo Booking Link]

In the demo, I'll show you how the agent can automate content creation, approvals, and social media posting for your business.

Looking forward to speaking with you`,
    COMMENT_REPLY_TEMPLATE:
      "I've sent you the details in your DM 📩 Check your inbox!",
    DETAILED_MESSAGE_CONTENT:
      'https://example.com/your-offer — enjoy!',
    // Global fallback trigger keywords (comma-separated). Empty = no gate; the
    // bot then DMs every commenter unless a per-post keyword list is set.
    DEFAULT_TRIGGER_KEYWORDS: '',
  };

  const coll = database.collection<TemplateDoc>(COLLECTIONS.templates);
  const now = new Date().toISOString();
  await Promise.all(
    Object.entries(defaults).map(([key, value]) =>
      coll.updateOne(
        { _id: key },
        { $setOnInsert: { _id: key, value, updatedAt: now } },
        { upsert: true },
      ),
    ),
  );

  // Clean up template keys from the retired follow-gate flow.
  await coll.deleteMany({
    _id: {
      $in: [
        'STEP_1_TEMPLATE',
        'STEP_2_TEMPLATE',
        'NUDGE_TEMPLATE',
        'DEFAULT_CONFIRMATION_KEYWORD',
      ],
    },
  });
}

/**
 * Sync the admin login account from the environment into the database. We store
 * only a scrypt hash of ADMIN_PASSWORD — never the plaintext. If the env email
 * changed, any stale admin rows are removed so exactly one admin exists. The
 * hash is only rewritten when the password actually changed, keeping the row
 * stable across restarts.
 */
async function seedAdminUser(database: Db): Promise<void> {
  const email = config.ADMIN_EMAIL.trim().toLowerCase();
  const coll = database.collection<AdminUserDoc>(COLLECTIONS.adminUsers);

  // Ensure there's only one admin, matching the current env email.
  await coll.deleteMany({ _id: { $ne: email } });

  const existing = await coll.findOne({ _id: email });
  const now = new Date().toISOString();

  if (existing && verifyPassword(config.ADMIN_PASSWORD, existing.passwordHash)) {
    return;
  }

  await coll.updateOne(
    { _id: email },
    { $set: { passwordHash: hashPassword(config.ADMIN_PASSWORD), updatedAt: now } },
    { upsert: true },
  );
  logger.info({ email }, 'Admin credentials synced to database');
}
