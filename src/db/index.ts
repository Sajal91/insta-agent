import { MongoClient, type Db, type Collection } from 'mongodb';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import type {
  FlowStateDoc,
  LogDoc,
  ProcessedCommentDoc,
  ReelConfigDoc,
  TemplateDoc,
  UserDoc,
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
  users: 'users',
} as const;

/**
 * Sentinel "owner" for the platform-wide default templates. Per-user templates
 * fall back to this owner's values when a user hasn't overridden a given key.
 */
export const GLOBAL_TEMPLATE_OWNER = '__global__';

/** Build the composite _id used for template documents. */
export function templateId(ownerId: string, key: string): string {
  return `${ownerId}::${key}`;
}

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
  users(): Collection<UserDoc> {
    return getDb().collection<UserDoc>(COLLECTIONS.users);
  },
};

async function ensureIndexes(database: Db): Promise<void> {
  // One open flow per (owner, commenter, reel).
  await database
    .collection(COLLECTIONS.flowStates)
    .createIndex({ ownerId: 1, igUserId: 1, reelId: 1 }, { unique: true });
  await database
    .collection(COLLECTIONS.flowStates)
    .createIndex({ ownerId: 1, igUserId: 1 });

  // Reel configs and processed comments are filtered per-tenant.
  await database.collection(COLLECTIONS.reelConfigs).createIndex({ ownerId: 1 });
  await database
    .collection(COLLECTIONS.processedComments)
    .createIndex({ ownerId: 1 });

  // Logs are read newest-first, scoped per-tenant.
  await database.collection(COLLECTIONS.logs).createIndex({ ownerId: 1, createdAt: -1 });

  // Users: unique by Google id + email; route webhooks by business account id
  // and verify handshakes by the per-user verify token.
  await database.collection(COLLECTIONS.users).createIndex({ googleId: 1 }, { unique: true });
  await database.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true });
  await database
    .collection(COLLECTIONS.users)
    .createIndex(
      { 'igCredentials.businessAccountId': 1 },
      { sparse: true },
    );
  await database
    .collection(COLLECTIONS.users)
    .createIndex({ 'igCredentials.verifyToken': 1 }, { sparse: true });
}

/**
 * Seed the platform-wide default templates (under the GLOBAL owner) only if
 * missing — never clobber edits. Per-user templates fall back to these.
 */
async function seedDefaultTemplates(database: Db): Promise<void> {
  const defaults: Record<string, string> = {
    DM_TEMPLATE:
      `Hi! 👋

Thanks for your interest.

You can book a free demo here:
[Your Demo Booking Link]

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
        { _id: templateId(GLOBAL_TEMPLATE_OWNER, key) },
        {
          $setOnInsert: {
            _id: templateId(GLOBAL_TEMPLATE_OWNER, key),
            ownerId: GLOBAL_TEMPLATE_OWNER,
            key,
            value,
            updatedAt: now,
          },
        },
        { upsert: true },
      ),
    ),
  );
}
