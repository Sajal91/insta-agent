import { collections, GLOBAL_TEMPLATE_OWNER, templateId } from '../index';

export type TemplateKey =
  | 'DM_TEMPLATE'
  | 'COMMENT_REPLY_TEMPLATE'
  | 'DETAILED_MESSAGE_CONTENT'
  | 'DEFAULT_TRIGGER_KEYWORDS';

const KEYS: TemplateKey[] = [
  'DM_TEMPLATE',
  'COMMENT_REPLY_TEMPLATE',
  'DETAILED_MESSAGE_CONTENT',
  'DEFAULT_TRIGGER_KEYWORDS',
];

/**
 * Per-tenant templates with a platform-wide fallback. A tenant's value for a
 * key wins; when absent we fall back to the GLOBAL default seeded on boot.
 */
export const templatesRepo = {
  async get(ownerId: string, key: TemplateKey): Promise<string | null> {
    const own = await collections
      .templates()
      .findOne({ _id: templateId(ownerId, key) });
    if (own) return own.value;
    const global = await collections
      .templates()
      .findOne({ _id: templateId(GLOBAL_TEMPLATE_OWNER, key) });
    return global?.value ?? null;
  },

  /** All template values for a tenant, filling gaps from the global defaults. */
  async getAll(ownerId: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const key of KEYS) {
      out[key] = (await this.get(ownerId, key)) ?? '';
    }
    return out;
  },

  async set(ownerId: string, key: TemplateKey, value: string): Promise<void> {
    await collections.templates().updateOne(
      { _id: templateId(ownerId, key) },
      {
        $set: {
          ownerId,
          key,
          value,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  },

  async setMany(
    ownerId: string,
    entries: Partial<Record<TemplateKey, string>>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const ops = Object.entries(entries)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        updateOne: {
          filter: { _id: templateId(ownerId, key) },
          update: {
            $set: { ownerId, key, value: value as string, updatedAt: now },
          },
          upsert: true,
        },
      }));
    if (ops.length > 0) {
      await collections.templates().bulkWrite(ops);
    }
  },
};
