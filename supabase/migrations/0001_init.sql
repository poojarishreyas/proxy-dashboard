-- shrey hosted dashboard schema.
--
-- Design: there is no per-user login. "Identities" are just display names the CLI
-- picked during `shrey setup`, distinguished by a random per-install device token.
-- The browser talks to Supabase directly with the anon key for live reads
-- (Realtime respects RLS), but can never write: every write comes from the Next.js
-- server (service role key, which bypasses RLS) after it has checked the shared
-- cloud key and the per-install token itself. Token hashes therefore live in a
-- table anon can never select from, even though RLS is technically satisfiable.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ identities

create table if not exists identities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Never selectable by anon/authenticated: no policy is added for them, and RLS
-- default-denies. Only the service role (which bypasses RLS entirely) can read
-- this to authenticate an ingest call.
create table if not exists identity_tokens (
  token_hash text primary key,
  identity_id uuid not null references identities(id) on delete cascade
);

-- --------------------------------------------------------------------- sessions

create table if not exists sessions (
  identity_id uuid not null references identities(id) on delete cascade,
  id text not null,
  title text,
  model text,
  source text,
  started_at timestamptz not null,
  updated_at timestamptz not null,
  requests int not null default 0,
  errors int not null default 0,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (identity_id, id)
);

create index if not exists sessions_updated_idx on sessions (updated_at desc);

-- ----------------------------------------------------------------------- events

create table if not exists events (
  identity_id uuid not null,
  session_id text not null,
  seq int not null,
  time bigint not null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (identity_id, session_id, seq),
  foreign key (identity_id, session_id) references sessions (identity_id, id) on delete cascade
);

create index if not exists events_session_idx on events (identity_id, session_id, seq);

-- ---------------------------------------------------------------------- objects
--
-- Content-addressed, exactly like the local capture store's objects/ directory:
-- a message, system prompt or tool list is written once per unique id and
-- referenced from events by that id.

create table if not exists objects (
  identity_id uuid not null references identities(id) on delete cascade,
  id text not null,
  kind text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  primary key (identity_id, id)
);

-- --------------------------------------------------------------------------- RLS

alter table identities enable row level security;
alter table identity_tokens enable row level security;
alter table sessions enable row level security;
alter table events enable row level security;
alter table objects enable row level security;

-- Public read, for the dashboard's anon-key Realtime subscriptions.
-- identity_tokens gets no policy at all, so it stays unreadable by anon/authenticated.
create policy "identities are publicly readable" on identities
  for select using (true);
create policy "sessions are publicly readable" on sessions
  for select using (true);
create policy "events are publicly readable" on events
  for select using (true);
create policy "objects are publicly readable" on objects
  for select using (true);

-- No insert/update/delete policies anywhere: every write must go through the
-- Next.js API routes using the service role key, which bypasses RLS by design.

-- Realtime: the dashboard subscribes to session and event changes.
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table events;
