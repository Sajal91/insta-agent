# insta-agent — Instagram Reels Comment Auto-Reply Agent

A backend server that automatically responds to comments on your Instagram Reels
using the **Instagram Graph API (Meta)**. Messages are **static/templated** (no
LLM/AI). Single-step flow:

1. **New top-level comment** → the bot **sends the details as a private reply (DM)**
   to the commenter, then **posts a public comment reply** saying the details have
   been sent to their DM.
2. Replies to comments (and the bot's own comments) are ignored — only fresh
   top-level comments trigger the flow.

> ⚠️ **DM requires an extra permission.** The private reply (DM) uses Instagram's
> private-reply endpoint (`POST /{ig-id}/messages` with `recipient.comment_id`),
> which needs **`instagram_business_manage_messages`** (Instagram Login) /
> **`pages_messaging`** (Facebook Login) plus Advanced Access. Meta also limits it
> to **one private reply per comment, within 7 days** of the comment. If the DM
> fails, the public "sent to your DM" reply is intentionally **not** posted.

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
    flows.routes.ts             # per-user delivery history (debugging)
    reply.routes.ts             # manual "send details" trigger
  services/
    instagram.service.ts        # Graph API calls (DM, comment reply, fetch) + retries
    flow-engine.service.ts      # the DM + comment-reply logic (fully unit-tested)
    template.service.ts         # placeholder substitution
    queue.service.ts            # in-memory async worker
  db/
    index.ts                    # Mongo connection, collections, indexes, template seed
    types.ts                    # document + domain shapes
    repositories/               # comments, flow-state, reels, templates, logs
  middleware/
    verify-webhook-signature.ts # X-Hub-Signature-256 (HMAC-SHA256)
    auth.ts                     # x-api-key gate for internal routes
  utils/                        # logger, http helpers
  app.ts
  server.ts
test/                           # vitest (flow-engine)
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
| `IG_GRAPH_BASE_URL` | API host: `https://graph.instagram.com` (Instagram Login, token starts with `IGAA`/`IGQ`) or `https://graph.facebook.com` (Facebook Login, Page token starts with `EAA`) |
| `IG_VERIFY_TOKEN` | Arbitrary string; must match the token you enter in Meta's webhook config |
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

Set `IG_GRAPH_BASE_URL` to match how you obtained your token:

**Instagram API with Instagram Login** (`https://graph.instagram.com`, token starts with `IGAA`/`IGQ`):

- `instagram_business_basic`
- `instagram_business_manage_comments` — read comments + post public replies
- `instagram_business_manage_messages` — **required for the DM (private reply)**

**Instagram API with Facebook Login** (`https://graph.facebook.com`, Page token starts with `EAA`):

- `instagram_basic`
- `instagram_manage_comments` — read comments + post public replies
- `pages_read_engagement`, `pages_show_list`
- `pages_messaging` — **required for the DM (private reply)**
- If the Page role was granted via Business Manager, also `ads_management` or `ads_read`

> Scope names change over time — **verify against the latest Meta docs**:
> [Comment Moderation](https://developers.facebook.com/docs/instagram-platform/comment-moderation)
> and [Private Replies](https://developers.facebook.com/docs/instagram-platform/private-replies/).

You will need **Advanced Access** for the comment + messaging permissions to use
the app in production (beyond your own dev/test users). Without the messaging
permission the DM step will fail (and the public reply won't be posted).

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

1. **Skip own comments** — if the author is `IG_BUSINESS_ACCOUNT_ID` (this is how
   the bot avoids reacting to its own "sent to your DM" reply).
2. **Idempotency** — skip if the comment ID was already processed (DB check), so
   Meta's webhook retries never double-send.
3. **Skip replies** — if `parent_id` is present (only fresh top-level comments
   trigger the flow).
4. **Fresh top-level comment** (no `parent_id`):
   - Skip if the reel is explicitly disabled, or the text hits a blocklist keyword.
   - **Send the DM** (private reply) with the detailed content → log `DM_SENT`.
   - **Post the public comment reply** ("sent to your DM") → log `COMMENT_REPLIED`.
   - Record a delivery row `{ igUserId, commentId, reelId, stage: COMPLETED }` and
     log `DETAILS_SENT`.

The DM is sent **first**: if it fails (missing permission, outside the 7-day
window, etc.), the whole event is caught and logged as `ERRORED` and the public
"sent to your DM" reply is **not** posted (so we never claim to have DMed when we
didn't). A failed action never crashes the process. Graph API calls use
exponential backoff on `429`/`5xx`/network errors (auth errors like `190` fail
fast — they aren't retryable).

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

- `DM_TEMPLATE` — the private message (DM) body. Supports `{{detailedMessageContent}}`, `{{pageHandle}}`, `{{username}}`
- `COMMENT_REPLY_TEMPLATE` — the public "sent to your DM" reply. Supports `{{pageHandle}}`, `{{username}}`
- `DETAILED_MESSAGE_CONTENT` — the payload (link/info/offer) injected into the DM

**Per-reel overrides** (different offers per reel) are set via the reels API
(`dmTemplate`, `commentReplyTemplate`, `detailedMessageContent`) and take
precedence over the global defaults.

---

## Internal API

All routes below require the `x-api-key: <API_KEY>` header. (The webhook routes do
**not** — they're authenticated by Meta's signature instead.)

### Reels

```bash
# List all reel configs
curl -H "x-api-key: $API_KEY" localhost:3000/reels

# Enable/disable + override DM/reply templates and offer content for a reel
curl -X POST -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{
    "reelId": "17900000000000000",
    "enabled": true,
    "dmTemplate": "Hey! Here is what you asked for: {{detailedMessageContent}}",
    "commentReplyTemplate": "Just DMed you the details 📩",
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
  -d '{ "COMMENT_REPLY_TEMPLATE": "Check your DMs 📩 (from @{{pageHandle}})" }' \
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

### Manual "send details" (testing)

```bash
# Dry run — renders both the DM and the public reply WITHOUT posting
curl -X POST -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{ "commentId": "17900000000000000", "dryRun": true }' \
  localhost:3000/reply/manual

# Actually DM the details + post the public reply for a comment
curl -X POST -H "x-api-key: $API_KEY" -H 'content-type: application/json' \
  -d '{ "commentId": "17900000000000000" }' \
  localhost:3000/reply/manual
```

---

## Testing

```bash
npm test
```

The suite covers the flow-engine decisions with **injected fake dependencies** (no
DB, no network):

- fresh comment → DM the details + post public reply (and record delivery)
- per-reel DM/detailed-content override is applied
- DM failure → `ERRORED`, and the public reply is **not** posted
- reply comment (`parent_id`) → ignored
- own comment / already-processed / disabled reel / blocklist → skipped

---

## Out of scope (v1)

- No LLM/AI messages — static templates only.
- No frontend/dashboard — API + logs endpoint only.
- No multi-account support — single IG Business account.
- No image/media comment handling — text comments only.

---

## License

MIT
