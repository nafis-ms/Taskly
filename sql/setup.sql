-- Taskly database setup. Run this ONCE in Supabase > SQL Editor (it is safe to run again).
-- Every table is only touched by the server (service-role key), so row level security is switched on with no public policies.

-- 1) Each member's tasks, reminders, schedule, history  (/api/data, reminder e-mails, admin stats)
create table if not exists public.taskly_data (
  user_id    uuid primary key references auth.users(id) on delete cascade, -- UNIQUE: the API upserts on it
  data       jsonb  not null default '{}'::jsonb,
  ts         bigint not null default 0,                                    -- bigint: Date.now() does not fit in int4
  updated_at timestamptz not null default now()
);
alter table public.taskly_data enable row level security;

-- 2) Feedback from the website and the app  (/api)
create table if not exists public.taskly_feedback (
  id         uuid primary key default gen_random_uuid(),
  email      text not null default '',
  name       text not null default 'Anonymous',
  rating     int  not null default 5 check (rating between 1 and 5),
  text       text not null,
  status     text not null default 'pending' check (status in ('pending','kept','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists taskly_feedback_status_idx on public.taskly_feedback (status, created_at desc);
alter table public.taskly_feedback enable row level security;

-- 3) Admin-editable website settings: contact details + developer cards  (/api/contact, /api/developers)
create table if not exists public.taskly_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.taskly_settings enable row level security;

-- 4) Live chat between visitors / members and the admin  (/api/chat)
create table if not exists public.taskly_chats (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,            -- the visitor's HttpOnly cookie
  name              text not null,
  email             text not null,
  status            text not null default 'open' check (status in ('open','closed')),
  created_at        timestamptz not null default now(),
  last_at           timestamptz not null default now(),
  last_text         text not null default '',
  last_from         text not null default 'visitor',
  admin_unread      int  not null default 0,
  visitor_unread    int  not null default 0,
  admin_typing_at   timestamptz,
  visitor_typing_at timestamptz
);
create index if not exists taskly_chats_last_idx on public.taskly_chats (last_at desc);
alter table public.taskly_chats enable row level security;

create table if not exists public.taskly_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.taskly_chats(id) on delete cascade,
  sender     text not null check (sender in ('visitor','admin')),
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists taskly_chat_messages_chat_idx on public.taskly_chat_messages (chat_id, created_at);
alter table public.taskly_chat_messages enable row level security;

-- 5) Which reminder e-mails were already sent, so nobody gets the same one twice  (/api/cron-reminders)
create table if not exists public.taskly_reminder_emails (
  user_id     uuid not null,
  reminder_id text not null,
  due         timestamptz not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, reminder_id, due)
);
create index if not exists taskly_reminder_emails_due_idx on public.taskly_reminder_emails (due);
alter table public.taskly_reminder_emails enable row level security;

-- ----------------------------------------------------------------------------------------------------------
-- If a table ALREADY existed with a different shape, these fix the usual problems:
--   alter table public.taskly_data alter column ts type bigint;
--   alter table public.taskly_data add constraint taskly_data_user_id_key unique (user_id);
--   alter table public.taskly_data add column if not exists updated_at timestamptz not null default now();
