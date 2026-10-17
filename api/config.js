/**
 * Public auth config for the browser (Vercel serverless function) -> route: /api/config
 *
 * Env vars (Vercel > Settings > Environment Variables):
 *   SUPABASE_URL        e.g. https://xxxx.supabase.co   (already set for the feedback API)
 *   SUPABASE_ANON_KEY   the "publishable" (sb_publishable_...) or "anon public" key.
 *                       Safe for the browser; NEVER use the service-role key here.
 */
module.exports = (req, res) => {
  const env = process.env;
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = String(
    env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  ).trim();

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (missing.length) {
    res.statusCode = 500;
    /* names only, never values */
    return res.end(JSON.stringify({ error: "Auth is not configured", missing }));
  }
  if (/service_role/i.test(anonKey) || /^sb_secret_/.test(anonKey)) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "SUPABASE_ANON_KEY must be the publishable/anon key, not a secret key" }));
  }
  res.statusCode = 200;
  res.end(JSON.stringify({ url, anonKey }));
};
