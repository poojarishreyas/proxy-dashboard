# shrey admin dashboard

The hosted counterpart to [`shrey-cli`](https://www.npmjs.com/package/shrey-cli): a
live, multi-user view of everyone's Claude Code activity captured through `shrey`.

`shrey-cli` ships with this deployment's URL and ingest key **built in** — every
install reports here by default under the name it was asked for on first run (no
account, no login for the person running `shrey`). This is the admin's view of that:
whoever deploys and holds the passphrase can watch activity across every machine
running shrey, live, in one place.

```
shrey (many machines)  ──POST /api/ingest──▶  Vercel  ──▶  Supabase (Postgres)
                                                  │
                                          you, in a browser ◀── polls /api/feed, /api/session/*
```

## Deploying your own

1. **Supabase** — new project (free tier is enough) → SQL Editor → run
   `supabase/migrations/0001_init.sql`. Grab the **Project URL** and the
   **service_role** key from Project Settings → API.
2. **Vercel** — `vercel link`, then set four env vars (`vercel env add <name>
   production`, and repeat for preview/development):

   | var | what |
   | --- | --- |
   | `SUPABASE_URL` | the project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key — server-side only, never sent to the browser |
   | `SHREY_CLOUD_KEY` | any random string; installs authenticate with this to push |
   | `SHREY_VIEW_KEY` | optional; a passphrase gating who can *view* the dashboard |

   `vercel --prod` to deploy.
3. Point installs at it: `shrey cloud <your-deploy-url> <SHREY_CLOUD_KEY>` (self-hosted
   form — the default `shrey cloud <name>` always means the *built-in* deployment
   baked into whatever `shrey-cli` version is installed, not this one).

## Why the browser never touches Supabase directly

The obvious way to get live updates would be Supabase Realtime with the public anon
key in the browser. That's not done here: gating the *page* behind `SHREY_VIEW_KEY`
would be cosmetic if the anon key were shipped to the browser too, since RLS is
enforced by Postgres, not by whether someone found the page — anyone with the key
could query Supabase directly, bypassing the passphrase entirely.

Instead the browser only ever talks to this app's own API routes (`/api/feed`,
`/api/session/*`), which use the service-role key server-side and enforce the
passphrase themselves (see `middleware.js`). No Supabase credential of any kind
reaches the browser. Live updates come from short polling (every 2–3s) rather than a
push subscription — less elegant, but it means the *only* way to read the data is
through a route that actually checks the passphrase.

## Identity model

There is no login. `identities` are rows keyed by a random per-install device token
(`identity_tokens`, unreadable by anyone but the service role) mapped to a display
name. `/api/ingest` upserts by that token on every sync, so renaming an install (e.g.
running `shrey setup` again) updates the existing row rather than creating a new one.

## Schema

See `supabase/migrations/0001_init.sql` for the authoritative version.

| table | holds |
| --- | --- |
| `identities` | id, display name, last-seen — publicly readable (no secrets) |
| `identity_tokens` | token hash → identity id — **not** readable by anon/authenticated, service-role only |
| `sessions` | one row per captured conversation |
| `events` | the session's event log, exactly as `shrey` stores it locally |
| `objects` | content-addressed messages/system-prompts/tool-lists, deduplicated per identity |

## Development

```bash
npm install
npm run dev      # needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local
npm run build
```

See `.env.local.example` for the variables `next dev` needs locally.
