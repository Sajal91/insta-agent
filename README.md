# insta-agent — Instagram Reels Comment Auto-Reply Agent

A backend server that automatically replies to comments on your Instagram Reels
using the **Instagram Graph API (Meta)**. Replies are **static/templated** (no
LLM/AI) and follow a **trust-based two-step follow-gate**:

1. **New comment** → the bot publicly replies with the **Step 1** template asking
   the commenter to follow the page and reply with a confirmation keyword (e.g.
   `DONE`).
2. **Commenter replies with the keyword** → the bot replies with the **Step 2**
   template (the detailed message: link, info, offer, etc.).
3. Everything else is ignored (and logged).

> ⚠️ **Why "trust-based"?** The Instagram Graph API does **not** expose whether a
> given commenter follows your account. The follow-gate is therefore an honor
> system implemented as the two-step comment flow above. Keyword matching is
> intentionally lenient.

---

## Tech stack

- **Node.js + Express** (TypeScript, strict mode)
- **Instagram Graph API** for fetching comments and posting replies
- **Meta Webhooks** for real-time comment events
- **MongoDB** (official `mongodb` driver) for persistence (processed comment IDs, flow state, templates, logs)
- **Zod** for env + request validation
- **pino** for structured logging
- **vitest** for tests

---

## Project structure

```
src/
  config/env.ts                 # env loading + validation (zod)
  routes/
    webhook.routes.ts           # GET handshake + POST receiver
    reels.routes.ts             # per-reel config
    templates.routes.ts         # default template editing
    logs.routes.ts              # paginated action log
    flows.routes.ts             # per-user flow state (debugging)
    reply.routes.ts             # manual Step 1/Step 2 trigger
  services/
    instagram.service.ts        # Graph API calls (fetch comment, post reply) + retries
    flow-engine.service.ts      # the two-step logic (fully unit-tested)
    template.service.ts         # placeholder substitution
    queue.service.ts            # in-memory async worker
  db/
    index.ts                    # Mongo connection, collections, indexes, template seed
    types.ts                    # document + domain shapes
    repositories/               # comments, flow-state, reels, templates, logs
  middleware/
    verify-webhook-signature.ts # X-Hub-Signature-256 (HMAC-SHA256)
    auth.ts                     # x-api-key gate for internal routes
  utils/                        # logger, keyword matcher, http helpers
  app.ts
  server.ts
test/                           # vitest (flow-engine + keyword matcher)
```

---

## Quick start (local dev)

```bash
# 1. Install
npm install

# 2. Make sure MongoDB is running (local or Atlas)
#    Local via Docker:
docker run -d --name insta-mongo -p 27017:27017 mongo:7

# 3. Configure
cp .env.example .env
#   then fill in the IG_* values (see below) and MONGODB_URI

# 4. Run in watch mode
npm run dev
```

On boot the app connects to MongoDB, creates its indexes, and seeds the default
templates (only if missing). Collections used: `processed_comments`,
`reel_configs`, `flow_states`, `templates`, `logs`.

Server boots on `PORT` (default `3000`). Health check: `GET /health`.

Other scripts:

```bash
npm run build       # compile to dist/
npm start           # run compiled dist/server.js
npm run typecheck   # tsc --noEmit
npm test            # run vitest suite
```

---

## Environment variables

Copy `.env.example` → `.env` and fill in:

| Var | Description |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | pino level (default `info`) |
| `IG_APP_ID` | Meta App ID |
| `IG_APP_SECRET` | Meta App Secret (used to verify webhook signatures) |
| `IG_ACCESS_TOKEN` | Long-lived access token for the connected IG Business account |
| `IG_BUSINESS_ACCOUNT_ID` | Your IG Business account ID — used to skip the bot's own comments |
| `IG_PAGE_HANDLE` | Your `@handle` (without the `@`); used in templates via `{{pageHandle}}` |
| `IG_GRAPH_API_VERSION` | Graph API version, e.g. `v21.0` |
| `IG_VERIFY_TOKEN` | Arbitrary string; must match the token you enter in Meta's webhook config |
| `DEFAULT_CONFIRMATION_KEYWORD` | Default confirmation keyword (e.g. `DONE`) |
| `SEND_NUDGE_ON_MISMATCH` | `true` → send a nudge on non-matching replies; `false` → ignore |
| `API_KEY` | Protects internal routes; sent as the `x-api-key` header |
| `MONGODB_URI` | MongoDB connection string (local `mongodb://127.0.0.1:27017` or Atlas `mongodb+srv://...`) |
| `MONGODB_DB` | Database name (default `insta_agent`) |

**No secrets are hardcoded** — everything is read from the environment and
validated at boot (the process refuses to start on an invalid config).

---

## Meta App + Instagram setup

You need an **Instagram Business or Creator account** connected to a **Facebook
Page**, and a **Meta App** (Business type).

### 1. Permissions / scopes

> Scope names change over time — **verify against the latest Meta docs**:
> [Comment Moderation](https://developers.facebook.com/docs/instagram-platform/comment-moderation)
> and [IG Comment Replies](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/).

This project targets the **Instagram API with Facebook Login** path
(`graph.facebook.com`). As of writing, replying to comments requires:

- `instagram_basic`
- `instagram_manage_comments` — required to read comments and post replies
- `pages_read_engagement`
- `pages_show_list`
- If the Page role was granted via Business Manager, also `ads_management` or `ads_read`

> There is also a newer **Instagram API with Instagram Login** path
> (`graph.instagram.com`) which uses `instagram_business_basic` +
> `instagram_business_manage_comments`. If you use that path, change the base URL
> in `src/services/instagram.service.ts` accordingly. The original prompt also
> mentioned `pages_manage_engagement`; the current docs list
> `instagram_manage_comments` (+ `pages_read_engagement`) as the relevant scopes
> for public comment replies, so double-check what your app actually needs in the
> App Dashboard.

You will need **Advanced Access** for the comment permissions to use the app in
production (beyond your own dev/test users).

### 2. Get a long-lived access token

1. Use the Graph API Explorer / your login flow to obtain a User (or Page) access
   token with the scopes above.
2. Exchange it for a **long-lived** token and store it in `IG_ACCESS_TOKEN`.
3. Find your **IG Business Account ID** (`IG_BUSINESS_ACCOUNT_ID`) via
   `GET /me/accounts?fields=instagram_business_account`.

### 3. Subscribe to the `comments` webhook

In your Meta App dashboard → **Webhooks** → **Instagram**:

- **Callback URL:** `https://<your-public-host>/webhooks/instagram`
- **Verify Token:** the value of `IG_VERIFY_TOKEN`
- Subscribe to the **`comments`** field.

Meta will call `GET /webhooks/instagram` with `hub.mode`, `hub.verify_token`, and
`hub.challenge`. This server echoes the challenge back **only** if the token
matches. **Meta won't send real events until this handshake succeeds**, so get
this working first.

Also ensure the connected Page/IG account is **subscribed** to your app for
webhook delivery.

### 4. Exposing localhost with ngrok

Meta requires a public HTTPS URL. In local dev, tunnel your port:

```bash
ngrok http 3000
# → use the https URL, e.g. https://abc123.ngrok-free.app/webhooks/instagram
```

Put that URL (with `/webhooks/instagram`) as the webhook Callback URL.

---

## How the flow engine works

For every incoming comment event (processed asynchronously off the request path):

1. **Skip own comments** — if the author is `IG_BUSINESS_ACCOUNT_ID`.
2. **Idempotency** — skip if the comment ID was already processed (DB check), so
   Meta's webhook retries never double-reply.
3. **Fresh top-level comment** (no `parent_id`):
   - Skip if the reel is explicitly disabled, or the text hits a blocklist keyword.
   - Post **Step 1** and store `{ igUserId, commentId, reelId, stage: AWAITING_FOLLOW_CONFIRMATION }`.
4. **Reply** (`parent_id` present):
   - Look up the user's open `AWAITING_FOLLOW_CONFIRMATION` state for that reel.
   - **Match** the confirmation keyword (lenient: trim, lowercase, common variants,
     ✅/👍 emoji) → post **Step 2**, set stage `COMPLETED`.
   - **No match** → send a **nudge** (if `SEND_NUDGE_ON_MISMATCH=true`) or ignore.
   - **No open state** → ignore.

A **failed reply is caught and logged as `ERRORED`** — it never crashes the
process. Graph API calls use exponential backoff on `429`/`5xx`/network errors.

### Async processing / queue

Webhook events are pushed onto a small **in-memory FIFO queue** and processed by a
single worker so the webhook endpoint can ACK Meta with `200` immediately.

> **Upgrade path for scale:** replace `queue.service.ts` with **BullMQ + Redis**
> for durable jobs, retries with dead-letter queues, concurrency, and multiple
> worker processes. The public surface (`enqueue`) is intentionally tiny.

---

## Templates

Default templates are seeded into the DB on first boot and editable via the API.
Placeholders use `{{key}}` and are filled by simple string replacement:

- `STEP_1_TEMPLATE` — supports `{{pageHandle}}`, `{{confirmationKeyword}}`, `{{username}}`
- `STEP_2_TEMPLATE` — supports `{{detailedMessageContent}}`, `{{pageHandle}}`, `{{confirmationKeyword}}`, `{{username}}`
- `NUDGE_TEMPLATE` — supports `{{confirmationKeyword}}`, `{{pageHandle}}`, `{{username}}`
- `DETAILED_MESSAGE_CONTENT` — the payload injected into Step 2
- `DEFAULT_CONFIRMATION_KEYWORD`

**Per-reel overrides** (different offers per reel) are set via the reels API and
take precedence over the global defaults.

---

## Internal API

All routes below require the `x-api-key: <API_KEY>` header. (The webhook routes do
**not** — they're authenticated by Meta's signature instead.)

### Reels

```bash
# List all reel configs
curl -H "x-api-key: $API_KEY" localhost:3000/reels

# Enable/disable + override keyword/templates for a reel
curl -X POST -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{
    "reelId": "17900000000000000",
    "enabled": true,
    "confirmationKeyword": "FOLLOWED",
    "step2Template": "Thanks! Grab it here: {{detailedMessageContent}}",
    "detailedMessageContent": "https://example.com/special-offer",
    "blocklistKeywords": ["spam", "http"]
  }' \
  localhost:3000/reels

# Get / delete one
curl -H "x-api-key: $API_KEY" localhost:3000/reels/17900000000000000
curl -X DELETE -H "x-api-key: $API_KEY" localhost:3000/reels/17900000000000000
```

### Templates

```bash
curl -H "x-api-key: $API_KEY" localhost:3000/templates

curl -X PUT -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{ "STEP_1_TEMPLATE": "Thanks! Follow @{{pageHandle}} then reply {{confirmationKeyword}}" }' \
  localhost:3000/templates
```

### Logs (paginated)

```bash
curl -H "x-api-key: $API_KEY" "localhost:3000/logs?limit=50&offset=0"
```

### Flow state (debugging a user)

```bash
curl -H "x-api-key: $API_KEY" localhost:3000/flows/<IG_USER_ID>
```

### Manual reply (testing)

```bash
# Dry run (renders message without posting)
curl -X POST -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{ "commentId": "17900000000000000", "step": 1, "dryRun": true }' \
  localhost:3000/reply/manual

# Actually post Step 2 to a comment
curl -X POST -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{ "commentId": "17900000000000000", "step": 2 }' \
  localhost:3000/reply/manual
```

---

## Testing

```bash
npm test
```

The suite covers the flow-engine decisions with **injected fake dependencies** (no
DB, no network):

- fresh comment → Step 1 (and stores state)
- valid confirmation → Step 2 (and completes)
- lenient confirmation variants (`done`, `Done!`, `FOLLOWED ✅`, `✅`, `yep`, …)
- invalid confirmation → nudge (or ignore when disabled)
- no open state → ignore
- own comment / already-processed / disabled reel / blocklist → skipped
- Graph API failure → logged as `ERRORED`, never throws

---

## Out of scope (v1)

- No LLM/AI replies — static templates only.
- No real follow verification (not possible via Graph API) — intentionally trust-based.
- No frontend/dashboard — API + logs endpoint only.
- No multi-account support — single IG Business account.
- No image/media comment handling — text comments only.

---

## License

MIT
