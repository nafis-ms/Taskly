/**
 * Public auth config for the browser (Vercel serverless function) -> route: /api/config
 *
 * Env vars (Vercel > Settings > Environment Variables):
 *   SUPABASE_URL        e.g. https://xxxx.supabase.co   (already set for the feedback API)
 *   SUPABASE_ANON_KEY   Supabase > Project Settings > API > "anon public" key
 *                       (safe for the browser; NEVER use the service-role key here)
 */
module.exports = (req, res) => {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (!url || !anonKey) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Auth is not configured" }));
  }
  res.statusCode = 200;
  res.end(JSON.stringify({ url, anonKey }));
};
