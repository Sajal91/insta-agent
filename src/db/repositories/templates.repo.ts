import { collections } from '../index';

export type TemplateKey =
  | 'DM_TEMPLATE'
  | 'COMMENT_REPLY_TEMPLATE'
  | 'DETAILED_MESSAGE_CONTENT'
  | 'DEFAULT_TRIGGER_KEYWORDS';

/** Global (default) templates + a couple of global config values. */
export const templatesRepo = {
  async get(key: TemplateKey): Promise<string | null> {
    const doc = await collections.templates().findOne({ _id: key });
    return doc?.value ?? null;
  },

  async getAll(): Promise<Record<string, string>> {
    const docs = await collections
      .templates()
      .find()
      .sort({ _id: 1 })
      .toArray();
    return Object.fromEntries(docs.map((d) => [d._id, d.value]));
  },

  async set(key: TemplateKey, value: string): Promise<void> {
    await collections
      .templates()
      .updateOne(
        { _id: key },
        { $set: { value, updatedAt: new Date().toISOString() } },
        { upsert: true },
      );
  },

  async setMany(entries: Partial<Record<TemplateKey, string>>): Promise<void> {
    const now = new Date().toISOString();
    const ops = Object.entries(entries)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        updateOne: {
          filter: { _id: key },
          update: { $set: { value: value as string, updatedAt: now } },
          upsert: true,
        },
      }));
    if (ops.length > 0) {
      await collections.templates().bulkWrite(ops);
    }
  },
};
