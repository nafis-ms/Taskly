# Taskly

To-do list, reminders, a daily/weekly schedule and reminder e-mails. A static front end (HTML/CSS/JS) plus Vercel serverless functions in `/api`, with Supabase for accounts and data.

## Files

| Path | What it is |
|---|---|
| `index.html`, `js/script.js` | Landing page: sign up, log in, reset password, feedback, contact chat |
| `app.html`, `js/app.js` | The signed-in app (To-Do, Reminders, Schedule, History, Settings) |
| `admin.html` | Admin panel: users, feedback, live chat, contact info, developers |
| `api/*.js` | Serverless routes. `api/_lib.js` holds the shared helpers |
| `sql/setup.sql` | Creates every database table (run once) |
| `google-apps-script/taskly-mailer.gs` | Free reminder e-mails through your Gmail |

## Setup

1. **Supabase**: create a project, then run `sql/setup.sql` in *SQL Editor*.
   In *Authentication*: turn on **Confirm email**; add your site URL (for example `https://your-site.vercel.app`) under *URL Configuration* (Site URL and Redirect URLs, including `https://your-site.vercel.app/index.html`). For Google sign-in enable the Google provider.
2. **Vercel** environment variables (then redeploy):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (secret)
   - `ADMIN_PASSWORD`: password for `admin.html`
   - `CRON_SECRET`: any long random text (reminder e-mails)
   - `GAS_MAIL_URL`: from the Apps Script setup (or `EMAIL_FROM` + `BREVO_API_KEY` / `RESEND_API_KEY`), optional `SITE_URL`, `EMAIL_TIMEZONE`
3. **Reminder e-mails** need something to call `GET /api/cron-reminders` every minute with `Authorization: Bearer <CRON_SECRET>`. Vercel's free plan only allows daily cron jobs, so use a free scheduler such as cron-job.org. Test with `/api/cron-reminders?test=you@mail.com` (same header).

## If saving fails

Open DevTools > Network, make an edit and look at `PUT /api/data`. The response names the cause (missing table, wrong env var, expired login). The app also shows a toast with the error number and retries every 15 seconds; changes stay on the device meanwhile.
