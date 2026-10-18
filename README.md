<div align="center">

# Taskly

**A calm, focused productivity web app for to-dos, reminders, daily routines and a 24-hour dashboard, with built-in support chat and an admin console.**

![Frontend](https://img.shields.io/badge/frontend-HTML%20%7C%20CSS%20%7C%20Vanilla%20JS-blue)
![Backend](https://img.shields.io/badge/backend-Vercel%20Serverless%20(Node.js)-black)
![Database](https://img.shields.io/badge/database-Supabase-3ecf8e)
![Auth](https://img.shields.io/badge/auth-Supabase%20Auth%20%2B%20Google-orange)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [API Reference](#api-reference)
- [Reminder E-mails](#reminder-e-mails)
- [Admin Panel](#admin-panel)
- [Deployment](#deployment)
- [Security Notes](#security-notes)
- [Contributing](#contributing)

---

## Overview

Taskly helps people do what they planned. It combines a task list, timed reminders, a weekly routine and a 24-hour day view in one lightweight web app. There is no frontend build step: the interface is plain HTML, CSS and vanilla JavaScript, and the backend is a small set of Vercel serverless functions that talk to Supabase.

The project ships with three surfaces:

| Surface | File | Purpose |
| --- | --- | --- |
| Landing page | `index.html` | Product overview, sign-up / log-in, public feedback slider, contact section, developer cards |
| Web app | `app.html` | The signed-in workspace (dashboard, to-do, reminders, schedule, history, settings) |
| Admin panel | `admin.html` | Password-protected console for users, feedback, live chat and site content |

---

## Features

### For users

- **To-Do lists**: add, complete and review tasks, with per-day tracking.
- **Task reminders**: set a reminder with a "remind me before" lead time in minutes, hours or days, organised by category (Study, Work, Creativity, Fitness, Meal, Household, Family & Social, Payment, Appointment).
- **Routine and daily plans**: a Schedule tab for today's plan and a weekly routine.
- **24-hour dashboard**: live time, a 24-hour cycle view, today's schedule, upcoming reminder and to-do summary on one screen.
- **History**: separate To-Do and Reminder history, plus a fresh-day rollover.
- **Cross-device sync**: tasks, reminders and schedule are saved per account and synced through the API, with `localStorage` as the local cache.
- **E-mail reminders**: a scheduled job e-mails the member when a reminder's lead time arrives.
- **In-app assistant and support chat**: an animated assistant on the dashboard, plus a chat panel that reaches the admin from any device.
- **Accounts**: e-mail and password sign-up with e-mail confirmation, Google sign-in, password reset, display-name and password management, disposable-e-mail blocking.
- **Appearance**: light and dark themes, optional animated backgrounds (bokeh in light mode, plexus network in dark mode), and full `prefers-reduced-motion` support.

### For administrators

- **Quick stats and most-active users** overview.
- **User management**: list accounts, suspend / reinstate, send password reset, delete.
- **Feedback moderation**: approve ("keep"), reject, delete, or publish feedback directly to the landing-page slider.
- **Contact Chat**: reply to visitors and users in real time, with typing indicators and open/closed status.
- **Site settings**: edit the landing page *Contact us* details and up to three *Meet the developers* cards.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JavaScript (no framework, no bundler) |
| Hosting and functions | [Vercel](https://vercel.com) static hosting and serverless functions (Node.js, CommonJS) |
| Database | [Supabase](https://supabase.com) PostgreSQL via the PostgREST API |
| Authentication | Supabase Auth (e-mail confirmation and Google OAuth), `@supabase/supabase-js` v2 loaded from jsDelivr |
| E-mail delivery | Google Apps Script mailer (default), or Brevo / Resend |
| Fonts | Google Fonts |

---

## Project Structure

```text
Taskly/
├── index.html              # Landing page
├── app.html                # Signed-in application
├── admin.html              # Admin console
├── vercel.json             # Vercel config (no-store caching for /api/*)
│
├── api/                    # Vercel serverless functions
│   ├── index.js            # /api               feedback (submit, moderate, public slider)
│   ├── config.js           # /api/config        public Supabase URL + anon key for the browser
│   ├── data.js             # /api/data          per-user app data (GET / PUT)
│   ├── users.js            # /api/users         admin: list, ban, unban, reset, delete accounts
│   ├── chat.js             # /api/chat          live chat (visitor and admin)
│   ├── contact.js          # /api/contact       landing-page contact info
│   ├── developers.js       # /api/developers    "Meet the developers" cards
│   └── cron-reminders.js   # /api/cron-reminders  scheduled reminder e-mails
│
├── js/
│   ├── store.js            # Browser store (TasklyStore): admin API client, caches
│   ├── auth.js             # Supabase Auth wrapper (TasklyAuth)
│   ├── app.js              # Main application logic (tasks, reminders, schedule, sync)
│   ├── script.js           # Landing page behaviour
│   ├── chat.js             # Visitor live-chat widget
│   ├── support.js          # In-app chat, feedback and activity heartbeat
│   ├── developers.js       # Developer cards renderer
│   ├── contact-info.js     # Contact section renderer
│   ├── robot.js            # Animated assistant
│   ├── bokeh.js            # Light-theme background effect
│   ├── plexus.js           # Dark-theme background effect
│   ├── cinematic.js        # Scroll / pointer motion layer
│   └── premium.js          # Visual polish layer
│
├── css/                    # Stylesheets (theme, layout, dashboard, chat, effects)
└── img/                    # Static images
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18 or later (the API uses the built-in `fetch`)
- The [Vercel CLI](https://vercel.com/docs/cli): `npm install -g vercel`
- A [Supabase](https://supabase.com) project
- *(Optional)* A Google OAuth client configured in Supabase for Google sign-in

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/Taskly.git
cd Taskly
```

### 2. Configure Supabase

1. Create a Supabase project and note its **Project URL**, **publishable (anon) key** and **service-role / secret key**.
2. Create the tables described in [Database](#database).
3. Under **Authentication**, enable **Confirm email**, and enable the **Google** provider if you want Google sign-in.
4. Add your site URL (for example `http://localhost:3000` and your production domain) to the allowed redirect URLs.

### 3. Set environment variables

Create a `.env` file in the project root (Vercel CLI loads it for local development) using the values from [Environment Variables](#environment-variables).

### 4. Run locally

```bash
vercel dev
```

Open `http://localhost:3000`. There is no build step: static files are served as-is and every file in `api/` becomes a function.

---

## Environment Variables

Set these in **Vercel > Project > Settings > Environment Variables** (or in a local `.env`).

### Required

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Publishable / anon key. Safe for the browser; served by `/api/config`. Never use a secret key here. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key used by the API functions. **Never expose it to the browser.** |
| `ADMIN_PASSWORD` | Password for `admin.html`; sent by the admin client as the `x-admin-key` header |

### Reminder e-mails

| Variable | Description |
| --- | --- |
| `CRON_SECRET` | Long random string. The scheduler must send it as `Authorization: Bearer <CRON_SECRET>` |
| `GAS_MAIL_URL` | Google Apps Script web-app URL used to send mail from your own Gmail (default, free) |
| `EMAIL_FROM` | Sender for Brevo / Resend, e.g. `Taskly <reminders@yourdomain.com>` (must be verified) |
| `BREVO_API_KEY` or `RESEND_API_KEY` | Alternative providers, used only if `GAS_MAIL_URL` is not set |
| `SITE_URL` | Optional. Link used in the e-mail button |
| `EMAIL_TIMEZONE` | Optional. Fallback time zone for reminders saved without one (default `Asia/Dhaka`) |

> `SUPABASE_ANON_KEY` also accepts the aliases `SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `SUPABASE_URL` accepts `NEXT_PUBLIC_SUPABASE_URL`.

---

## Database

Taskly uses the following Supabase tables. Access goes through the API functions using the service-role key, so enable Row Level Security and do not expose these tables to the anon role.

| Table | Used by | Purpose |
| --- | --- | --- |
| `taskly_data` | `/api/data`, `/api/users`, `/api/cron-reminders` | One row per user: `user_id` (unique), `data` (JSON: todos, reminders, schedule, history…), `ts`, `updated_at` |
| `taskly_feedback` | `/api` | Feedback: `id`, `email`, `name`, `rating` (1–5), `text`, `status` (`pending` / `kept` / `rejected`), `created_at` |
| `taskly_chats` | `/api/chat` | One row per conversation: `id`, `token`, `name`, `email`, `status` (`open` / `closed`), typing and unread counters |
| `taskly_chat_messages` | `/api/chat` | Messages: `id`, `chat_id`, `sender` (`visitor` / `admin`), `text`, `created_at` |
| `taskly_settings` | `/api/contact`, `/api/developers` | Key/value site content: `key` (`contact`, `developers`), `value` (JSON), `updated_at` |
| `taskly_reminder_emails` | `/api/cron-reminders` | De-duplication log of sent reminders: `user_id`, `reminder_id`, `due`, `sent_at` |

---

## API Reference

All endpoints return JSON and are served with `Cache-Control: no-store`. Admin endpoints require the header `x-admin-key: <ADMIN_PASSWORD>`.

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/config` | GET | Public | Returns the Supabase URL and anon key for the browser client |
| `/api` | POST | Public | Submit feedback `{ name, email, rating, text }` (text up to 1000 chars; stored as `pending`) |
| `/api?public=1` | GET | Public | Approved feedback only (no e-mails) for the landing-page slider |
| `/api` | GET | Admin | List all feedback |
| `/api` | POST | Admin | Add feedback straight to the slider (`status: "kept"`) |
| `/api?id=ID&status=kept\|rejected\|pending` | PATCH | Admin | Change a feedback item's status |
| `/api?id=ID` | DELETE | Admin | Delete feedback |
| `/api/data` | GET / PUT | User (Bearer token) | Read / save the signed-in user's app data (verified e-mail required, 900 KB limit) |
| `/api/users` | GET | Admin | List accounts with activity stats |
| `/api/users?id=ID&action=ban\|unban\|reset\|delete` | POST | Admin | Manage an account |
| `/api/chat` | GET / POST | Visitor (HttpOnly cookie) | Start, read and send messages, typing signal; rate-limited to 15 messages per minute |
| `/api/chat?admin=1…` | GET / POST / PATCH / DELETE | Admin | List conversations, reply, typing, resolve / reopen, delete |
| `/api/contact` | GET | Public | Contact section content |
| `/api/contact` | PUT | Admin | Update contact section content |
| `/api/developers` | GET | Public | Developer cards (max 3) |
| `/api/developers` | PUT | Admin | Update developer cards |
| `/api/cron-reminders` | GET | Scheduler (`CRON_SECRET`) | Send due reminder e-mails; add `?test=you@mail.com` to send a sample |

User-facing endpoints authenticate with the Supabase session token: `Authorization: Bearer <access_token>`.

---

## Reminder E-mails

Reminder e-mails are sent by `api/cron-reminders.js`, which must be called **every minute** by a scheduler.

1. Set `CRON_SECRET` and one e-mail provider (`GAS_MAIL_URL`, or `EMAIL_FROM` with `BREVO_API_KEY` / `RESEND_API_KEY`).
2. Point a scheduler at `https://<your-domain>/api/cron-reminders` with the header `Authorization: Bearer <CRON_SECRET>`. Any HTTP scheduler works (for example cron-job.org, GitHub Actions, or Vercel Cron on a plan that supports per-minute schedules).
3. Verify delivery with `GET /api/cron-reminders?test=you@mail.com`.

Behaviour worth knowing:

- Each reminder is e-mailed **once**, tracked in `taskly_reminder_emails`.
- A 10-minute grace period covers late scheduler ticks.
- At most 40 e-mails are sent per run; the remainder go out on the next tick.
- Sent-log entries older than 60 days are cleaned up automatically.

---

## Admin Panel

Open `/admin.html` and sign in with `ADMIN_PASSWORD`. The password is kept in `sessionStorage` for the current tab only.

| Section | What you can do |
| --- | --- |
| Quick Stats / Most active | Overview of accounts and engagement |
| Users | View, suspend, reinstate, reset passwords, delete accounts |
| Chat / Contact Chat | Answer live conversations, close or reopen them |
| Feedback | Moderate submissions and curate the public slider |
| Settings > Contact Info | Edit the landing page contact section |
| Settings > Developers | Manage up to three developer cards (name, role, bio, photo, GitHub, LinkedIn, website) |

---

## Deployment

Taskly deploys to Vercel with zero build configuration.

1. Push the repository to GitHub.
2. Import it into Vercel (**Framework Preset: Other**, no build command, no output directory).
3. Add all [environment variables](#environment-variables).
4. Deploy, then configure your reminder scheduler and add the production domain to Supabase's allowed redirect URLs.

`vercel.json` disables caching on every `/api/*` response so data is always fresh.

---

## Security Notes

- The **service-role key** and **admin password** are used only inside serverless functions and are never sent to the browser.
- Admin passwords are compared with a constant-time check (`crypto.timingSafeEqual` over SHA-256 digests).
- `/api/data` accepts only users with a **confirmed e-mail** and validates the Supabase session server-side on every request.
- Public feedback never exposes e-mail addresses, and only the admin can publish feedback directly.
- User input is stripped of control characters and length-limited before storage.
- Chat uses an **HttpOnly** cookie to identify visitors and includes flood protection.
- Known disposable e-mail domains are rejected at sign-up; keep **Confirm email** enabled in Supabase as the primary safeguard.
- Use a strong, unique `ADMIN_PASSWORD` and a long random `CRON_SECRET`, and rotate them if they are ever exposed.

---

## Contributing

Contributions are welcome.

1. Fork the repository and create a feature branch: `git checkout -b feature/my-change`
2. Keep changes focused and match the existing code style (plain JavaScript, no build tooling).
3. Test locally with `vercel dev`, including light and dark themes and mobile widths.
4. Commit with a clear message and open a pull request describing the change and how you tested it.

Please report security issues privately to the maintainers rather than opening a public issue.

---

<div align="center">

Built with care for people who want to get things done.

</div>
