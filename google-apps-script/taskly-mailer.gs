/**
 * Taskly mailer: sends the reminder e-mails through YOUR Gmail account for free.
 *
 * Setup (5 minutes):
 *  1. Go to https://script.google.com > New project, paste this whole file, save.
 *  2. Project Settings (gear) > Script properties > Add:  CRON_SECRET = the same value you set in Vercel.
 *  3. Deploy > New deployment > type "Web app":  Execute as "Me",  Who has access "Anyone".  Authorise when asked.
 *  4. Copy the web app URL (ends with /exec) into Vercel as  GAS_MAIL_URL, then redeploy.
 *  5. Test:  https://YOUR-SITE/api/cron-reminders?test=you@gmail.com&secret=YOUR_CRON_SECRET
 *
 * Gmail's free limit is about 100 recipients a day (2,000 with Google Workspace).
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty("CRON_SECRET");
    if (!secret || data.secret !== secret) return out({ ok: false, error: "Wrong secret" });
    if (!data.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)) return out({ ok: false, error: "Bad recipient" });
    GmailApp.sendEmail(data.to, String(data.subject || "Taskly reminder").slice(0, 200), String(data.text || ""), {
      htmlBody: String(data.html || ""),
      name: String(data.name || "Taskly"),
    });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
