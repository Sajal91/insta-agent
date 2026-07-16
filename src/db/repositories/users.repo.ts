import { ObjectId, type WithId } from 'mongodb';
import { collections } from '../index';
import { config } from '../../config/env';
import { decryptSecret, encryptSecret } from '../../utils/crypto';
import {
  emptySubscription,
  type CredentialSummary,
  type IgCredentials,
  type StoredIgCredentials,
  type Subscription,
  type User,
  type UserDoc,
  type UserRole,
} from '../types';

/** Input used to persist a user's Instagram credentials (from the OAuth connect flow). */
export interface CredentialsInput {
  appId: string;
  appSecret: string;
  accessToken: string;
  businessAccountId: string;
  pageHandle: string;
  verifyToken: string;
  graphApiVersion?: string;
  graphBaseUrl?: string;
}

function toStored(input: CredentialsInput): StoredIgCredentials {
  return {
    appId: input.appId,
    appSecretEnc: encryptSecret(input.appSecret),
    accessTokenEnc: encryptSecret(input.accessToken),
    businessAccountId: input.businessAccountId,
    pageHandle: input.pageHandle,
    verifyToken: input.verifyToken,
    graphApiVersion: input.graphApiVersion?.trim() || 'v21.0',
    graphBaseUrl: input.graphBaseUrl?.trim() || 'https://graph.instagram.com',
  };
}

/** Decrypt a stored credential set into a usable IgCredentials, or null. */
export function decryptStored(
  stored: StoredIgCredentials | null,
): IgCredentials | null {
  if (!stored) return null;
  const appSecret = decryptSecret(stored.appSecretEnc);
  const accessToken = decryptSecret(stored.accessTokenEnc);
  if (appSecret === null || accessToken === null) return null;
  return {
    appId: stored.appId,
    appSecret,
    accessToken,
    businessAccountId: stored.businessAccountId,
    pageHandle: stored.pageHandle,
    verifyToken: stored.verifyToken,
    graphApiVersion: stored.graphApiVersion,
    graphBaseUrl: stored.graphBaseUrl,
  };
}

function credentialSummary(doc: WithId<UserDoc>): CredentialSummary {
  if (doc.igCredentials) {
    return {
      configured: true,
      businessAccountId: doc.igCredentials.businessAccountId,
      pageHandle: doc.igCredentials.pageHandle,
      source: 'stored',
    };
  }
  // The admin falls back to the env credentials when none are stored.
  const isAdmin =
    doc.role === 'admin' ||
    doc.email.trim().toLowerCase() === config.ADMIN_EMAIL.trim().toLowerCase();
  const hasEnv = Boolean(
    config.IG_ACCESS_TOKEN && config.IG_BUSINESS_ACCOUNT_ID && config.IG_APP_SECRET,
  );
  if (isAdmin && hasEnv) {
    return {
      configured: true,
      businessAccountId: config.IG_BUSINESS_ACCOUNT_ID,
      pageHandle: config.IG_PAGE_HANDLE,
      source: 'env',
    };
  }
  return {
    configured: false,
    businessAccountId: null,
    pageHandle: null,
    source: 'none',
  };
}

/** Map a stored user document to the API-safe domain shape (no secrets). */
export function mapUser(doc: WithId<UserDoc>): User {
  return {
    id: doc._id.toString(),
    googleId: doc.googleId,
    email: doc.email,
    name: doc.name,
    picture: doc.picture,
    role: doc.role,
    credentials: credentialSummary(doc),
    subscription: doc.subscription ?? emptySubscription(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}

export const usersRepo = {
  async findById(id: string): Promise<WithId<UserDoc> | null> {
    if (!ObjectId.isValid(id)) return null;
    return collections.users().findOne({ _id: new ObjectId(id) });
  },

  async findByGoogleId(googleId: string): Promise<WithId<UserDoc> | null> {
    return collections.users().findOne({ googleId });
  },

  async findByEmail(email: string): Promise<WithId<UserDoc> | null> {
    return collections.users().findOne({ email: email.trim().toLowerCase() });
  },

  /** Find the approved tenant that owns a given Instagram business account id. */
  async findByBusinessAccountId(
    businessAccountId: string,
  ): Promise<WithId<UserDoc> | null> {
    return collections
      .users()
      .findOne({ 'igCredentials.businessAccountId': businessAccountId });
  },

  /** Find the tenant whose per-user verify token matches (webhook handshake). */
  async findByVerifyToken(
    verifyToken: string,
  ): Promise<WithId<UserDoc> | null> {
    return collections
      .users()
      .findOne({ 'igCredentials.verifyToken': verifyToken });
  },

  /** Find the user who owns a given Razorpay subscription id (webhook routing). */
  async findBySubscriptionId(
    razorpaySubscriptionId: string,
  ): Promise<WithId<UserDoc> | null> {
    return collections
      .users()
      .findOne({ 'subscription.razorpaySubscriptionId': razorpaySubscriptionId });
  },

  /**
   * Create the user on first Google login, or refresh their profile fields on
   * subsequent logins. `adminEmail` is auto-promoted to the admin role.
   */
  async upsertFromGoogle(
    profile: GoogleProfile,
    adminEmail: string,
  ): Promise<WithId<UserDoc>> {
    const coll = collections.users();
    const email = profile.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const existing = await coll.findOne({ googleId: profile.googleId });

    if (existing) {
      const shouldBeAdmin = email === adminEmail.trim().toLowerCase();
      await coll.updateOne(
        { _id: existing._id },
        {
          $set: {
            email,
            name: profile.name,
            picture: profile.picture,
            // Promote to admin if the email matches; never auto-demote.
            role: shouldBeAdmin ? 'admin' : existing.role,
            updatedAt: now,
          },
        },
      );
      return (await coll.findOne({ _id: existing._id }))!;
    }

    const role: UserRole =
      email === adminEmail.trim().toLowerCase() ? 'admin' : 'user';
    const doc: UserDoc = {
      googleId: profile.googleId,
      email,
      name: profile.name,
      picture: profile.picture,
      role,
      igCredentials: null,
      subscription: emptySubscription(),
      createdAt: now,
      updatedAt: now,
    };
    const res = await coll.insertOne(doc);
    return (await coll.findOne({ _id: res.insertedId }))!;
  },

  async list(): Promise<User[]> {
    const docs = await collections
      .users()
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(mapUser);
  },

  async setRole(id: string, role: UserRole): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const now = new Date().toISOString();
    const coll = collections.users();
    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role, updatedAt: now } },
    );
    const doc = await coll.findOne({ _id: new ObjectId(id) });
    return doc ? mapUser(doc) : null;
  },

  /** Store the Instagram credentials obtained from the self-serve OAuth flow. */
  async connectInstagram(
    id: string,
    input: CredentialsInput,
  ): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const now = new Date().toISOString();
    const coll = collections.users();
    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { igCredentials: toStored(input), updatedAt: now } },
    );
    const doc = await coll.findOne({ _id: new ObjectId(id) });
    return doc ? mapUser(doc) : null;
  },

  async clearCredentials(id: string): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const now = new Date().toISOString();
    const coll = collections.users();
    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { igCredentials: null, updatedAt: now } },
    );
    const doc = await coll.findOne({ _id: new ObjectId(id) });
    return doc ? mapUser(doc) : null;
  },

  /**
   * Record that a Razorpay subscription (and customer) has been created for a
   * user. Moves the subscription into the `created` state, awaiting the mandate
   * authorization + first charge (confirmed later via webhook).
   */
  async startSubscription(
    id: string,
    params: {
      razorpaySubscriptionId: string;
      razorpayCustomerId: string | null;
      planId: string;
    },
  ): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const now = new Date().toISOString();
    const coll = collections.users();
    const doc = await coll.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    const existing = doc.subscription ?? emptySubscription();
    const subscription: Subscription = {
      ...existing,
      status: 'created',
      razorpaySubscriptionId: params.razorpaySubscriptionId,
      razorpayCustomerId: params.razorpayCustomerId,
      planId: params.planId,
      updatedAt: now,
    };
    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { subscription, updatedAt: now } },
    );
    const updated = await coll.findOne({ _id: new ObjectId(id) });
    return updated ? mapUser(updated) : null;
  },

  /**
   * Apply a partial subscription update (used by the Razorpay webhook handler as
   * events arrive). Merges onto the current subscription and stamps updatedAt.
   */
  async updateSubscription(
    id: string,
    patch: Partial<Subscription>,
  ): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const now = new Date().toISOString();
    const coll = collections.users();
    const doc = await coll.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    const existing = doc.subscription ?? emptySubscription();
    const subscription: Subscription = {
      ...existing,
      ...patch,
      updatedAt: now,
    };
    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { subscription, updatedAt: now } },
    );
    const updated = await coll.findOne({ _id: new ObjectId(id) });
    return updated ? mapUser(updated) : null;
  },
};
