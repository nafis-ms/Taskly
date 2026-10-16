-- Run once in Supabase > SQL Editor (use a new project, or your "portfolio" project)
create table if not exists public.taskly_feedback (
  id uuid primary key default gen_random_uuid(),
  email text default '',
  name text default 'Anonymous',
  rating int not null default 5 check (rating between 1 and 5),
  text text not null,
  status text not null default 'pending' check (status in ('pending','kept')),
  created_at timestamptz not null default now()
);
-- RLS on, no public policies: only the server (service role key in api/index.js) can read/write.
alter table public.taskly_feedback enable row level security;
