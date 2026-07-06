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

  const isSrv = config.MONGODB_URI.startsWith('mongodb+srv://');

  client = new MongoClient(config.MONGODB_URI, {
    appName: 'insta-agent',
    serverSelectionTimeoutMS: config.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
    // Atlas uses replica sets; retryable writes are the recommended default.
    retryWrites: true,
  });

  try {
    await client.connect();
    // Fail fast with a clear error if we authenticated but can't reach the DB.
    await client.db(config.MONGODB_DB).command({ ping: 1 });
  } catch (err) {
    await client.close().catch(() => undefined);
    client = null;
    logConnectionError(err, isSrv);
    throw err;
  }

  db = client.db(config.MONGODB_DB);

  await ensureIndexes(db);
  await seedDefaultTemplates(db);
  await seedAdminUser(db);

  logger.info(
    { db: config.MONGODB_DB, srv: isSrv },
    'MongoDB connected',
  );
  return db;
}

/**
 * Turn the driver's low-level errors into an actionable hint. The vast majority
 * of Atlas connection failures fall into one of these buckets.
 */
function logConnectionError(err: unknown, isSrv: boolean): void {
  const name = err instanceof Error ? err.name : 'Error';
  const message = err instanceof Error ? err.message : String(err);

  let hint =
    'Check MONGODB_URI, network access, and that the cluster is running.';

  if (name === 'MongoServerSelectionError' || /server selection/i.test(message)) {
    hint =
      'Could not reach any MongoDB server. On Atlas: add this host/server IP (or 0.0.0.0/0 for testing) under Network Access, and confirm the cluster hostname is correct.';
  } else if (/authentication failed|bad auth|SCRAM/i.test(message)) {
    hint =
      'Authentication failed. Verify the Atlas DB username/password. If the password contains special characters (@ : / ? # etc.) they MUST be percent-encoded in MONGODB_URI (e.g. "@" -> "%40").';
  } else if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(message)) {
    hint = isSrv
      ? 'DNS lookup for the SRV record failed. Double-check the cluster hostname in your mongodb+srv:// URI and your network/DNS.'
      : 'Host not found. Double-check the hostname in MONGODB_URI.';
  }

  logger.error({ err: { name, message }, hint }, 'MongoDB connection failed');
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
