/* Taskly auth: Supabase Auth (Google sign-in + email confirmation + password reset).
   Loaded after store.js on index.html and app.html.
   On app.html the script tag has data-guard: visitors without a verified session are sent back to the landing page. */
var TasklyAuth = (function () {
  "use strict";
  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  var USER_KEY = "taskly:user";
  var client = null, booting = null;
  var guard = !!(document.currentScript && document.currentScript.hasAttribute("data-guard"));

  /* common throw-away mail domains (extend as needed). The real protection is Supabase's "Confirm email" setting. */
  var DISPOSABLE = ["mailinator.com","guerrillamail.com","10minutemail.com","tempmail.com","temp-mail.org","trashmail.com","yopmail.com","sharklasers.com","getnada.com","throwawaymail.com","dispostable.com","maildrop.cc","fakeinbox.com","mintemail.com","mohmal.com","emailondeck.com","spambox.us","tempr.email","burnermail.io","moakt.com"];
  function isDisposable(email) {
    var d = String(email).toLowerCase().split("@")[1] || "";
    return DISPOSABLE.some(function (x) { return d === x || d.slice(-x.length - 1) === "." + x; });
  }

  /* ---------- load the SDK + public config, create the client (once) ---------- */
  function load(src) {
    return new Promise(function (ok, no) {
      if (window.supabase) return ok();
      var s = document.createElement("script");
      s.src = src; s.onload = ok;
      s.onerror = function () { no(new Error("Could not load the sign-in service. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
  }
  function boot() {
    if (booting) return booting;
    booting = Promise.all([
      load(SDK),
      fetch("/api/config", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("Sign-in is not configured yet.");
        return r.json();
      })
    ]).then(function (a) {
      client = window.supabase.createClient(a[1].url, a[1].anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
      });
      client.auth.onAuthStateChange(function (evt) {
        if (evt === "PASSWORD_RECOVERY") window.dispatchEvent(new CustomEvent("taskly-recovery"));
        /* signed out here, in another tab, or because the session could no longer be refreshed (e.g. suspended account) */
        if (evt === "SIGNED_OUT") {
          clearLocal();
          if (guard) location.replace("index.html");
          else window.dispatchEvent(new CustomEvent("taskly-signedout"));
        }
      });
      return client;
    });
    booting.catch(function () { booting = null; });
    return booting;
  }

  /* ---------- local mirror of the session (what the pages read) ---------- */
  function nameOf(u) {
    var m = (u && u.user_metadata) || {};
    return m.full_name || m.name || String((u && u.email) || "").split("@")[0];
  }
  /* a session only counts when the email is verified (Google accounts always are) */
  function verified(u) { return !!(u && (u.email_confirmed_at || u.confirmed_at)); }

  function clearData() {
    try { ["taskly:data:v1", "taskly:ts", "taskly:dirty"].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }
  function clearLocal() { try { localStorage.removeItem(USER_KEY); } catch (e) {} clearData(); }
  /* Supabase keeps its own session under sb-<project>-auth-token */
  function wipeSession() {
    try {
      Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); });
    } catch (e) {}
  }
  function hasStoredSession() {
    try { return Object.keys(localStorage).some(function (k) { return /^sb-.*-auth-token$/.test(k); }); } catch (e) { return false; }
  }
  function saveName(email, name) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify({ email: email, name: name }));
      var m = JSON.parse(localStorage.getItem("taskly:names") || "{}") || {};
      m[String(email).toLowerCase()] = name;
      localStorage.setItem("taskly:names", JSON.stringify(m));
    } catch (e) {}
  }
  function publish(u) {
    try {
      var prev = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      if (prev && prev.email && prev.email.toLowerCase() !== u.email.toLowerCase()) clearData(); /* never show another user's tasks */
    } catch (e) {}
    saveName(u.email, nameOf(u));
    window.dispatchEvent(new CustomEvent("taskly-auth", { detail: { email: u.email, name: nameOf(u) } }));
  }

  /* ---------- messages + password rules ---------- */
  function friendly(err) {
    var m = String((err && err.message) || err || "");
    if (/email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox (and spam) for the link.";
    if (/invalid login credentials/i.test(m)) return "Incorrect email or password.";
    if (/banned|suspended/i.test(m)) return "This account is suspended. Contact support.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a few minutes and try again.";
    if (/different from the old|same as the old/i.test(m)) return "Choose a password you haven't used before.";
    if (/already (been )?registered|already exists/i.test(m)) return "An account with this email already exists.";
    if (/password/i.test(m) && /(least|short|weak)/i.test(m)) return "Choose a stronger password (8+ characters).";
    if (/failed to fetch|networkerror|load failed/i.test(m)) return "Can't reach the server. Check your connection and try again.";
    return m || "Something went wrong. Please try again.";
  }
  /* password strength: 1 type of character = easy, 2 = medium (e.g. letters + numbers), 3 (letters + numbers + symbols) = hard */
  function strength(pw) {
    pw = String(pw || "");
    if (!pw) return { level: 0, label: "" };
    var types = (/[A-Za-z]/.test(pw) ? 1 : 0) + (/[0-9]/.test(pw) ? 1 : 0) + (/[^A-Za-z0-9\s]/.test(pw) ? 1 : 0);
    var level = pw.length < 8 ? 1 : Math.max(1, types);
    return { level: level, label: ["", "Easy", "Medium", "Hard"][level] };
  }
  /* "" when the password is acceptable, otherwise the message to show */
  function passwordProblem(pw) {
    pw = String(pw || "");
    if (pw.length < 8) return "Use at least 8 characters.";
    if (strength(pw).level < 2) return "Password is too easy. Mix letters and numbers (add a symbol for a hard password).";
    return "";
  }

  /* run a Supabase call, always resolving { error } instead of throwing */
  function run(fn) {
    return boot().then(fn).then(function (r) { return r && r.error ? { error: r.error } : (r || {}); }).catch(function (e) { return { error: e }; });
  }
  function currentUser() {
    return boot().then(function (c) { return c.auth.getSession(); }).then(function (r) { return (r.data && r.data.session && r.data.session.user) || null; }).catch(function () { return null; });
  }

  var API = {
    token: function () {
      return boot().then(function (c) { return c.auth.getSession(); })
        .then(function (r) { return r.data && r.data.session ? r.data.session.access_token : null; })
        .catch(function () { return null; });
    },
    strength: strength,
    passwordProblem: passwordProblem,
    isDisposable: isDisposable,
    friendly: friendly,
    /* "email", "google"... of the signed-in account ("" if unknown) */
    provider: function () {
      return currentUser().then(function (u) { return (u && u.app_metadata && u.app_metadata.provider) || ""; });
    },
    signUp: function (email, pw, name) {
      if (isDisposable(email)) return Promise.resolve({ error: { message: "Please use a real email address, not a temporary one." } });
      return run(function (c) {
        return c.auth.signUp({ email: email, password: pw, options: { data: { full_name: name }, emailRedirectTo: location.origin + "/index.html" } });
      }).then(function (r) {
        if (r.error) return r;
        /* Supabase hides existing accounts: a fake "user" with no identities comes back */
        if (r.data && r.data.user && r.data.user.identities && !r.data.user.identities.length)
          return { error: { message: "An account with this email already exists. Try logging in." } };
        return { needsConfirm: !(r.data && r.data.session) };
      });
    },
    signIn: function (email, pw) {
      return run(function (c) { return c.auth.signInWithPassword({ email: email, password: pw }); }).then(function (r) {
        if (r.error) return r;
        if (!verified(r.data.user)) return { error: { message: "Email not confirmed" } };
        publish(r.data.user);
        return { user: r.data.user };
      });
    },
    google: function () {
      return run(function (c) { return c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/index.html" } }); });
    },
    resetPassword: function (email) {
      return run(function (c) { return c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/index.html" }); });
    },
    resend: function (email) {
      return run(function (c) { return c.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: location.origin + "/index.html" } }); });
    },
    /* after the reset link: choose a new password, then the member is signed in */
    setNewPassword: function (pw) {
      return run(function (c) { return c.auth.updateUser({ password: pw }); }).then(function (r) {
        if (r.error) return r;
        return currentUser().then(function (u) { if (u && verified(u)) publish(u); return { user: u }; });
      });
    },
    /* settings: display name (stored with the account) */
    updateName: function (name) {
      return run(function (c) { return c.auth.updateUser({ data: { full_name: name } }); }).then(function (r) {
        if (!r.error) { var u = readLocalUser(); if (u.email) saveName(u.email, name); }
        return r;
      });
    },
    /* settings: new e-mail address. Supabase mails a confirmation link; the address changes once it is clicked. */
    changeEmail: function (email) {
      return run(function (c) { return c.auth.updateUser({ email: email }, { emailRedirectTo: location.origin + "/index.html" }); });
    },
    /* settings: change the password after checking the current one */
    changePassword: function (email, current, next) {
      return run(function (c) { return c.auth.signInWithPassword({ email: email, password: current }); }).then(function (r) {
        if (r.error) return { error: { message: "Current password is incorrect." } };
        return run(function (c) { return c.auth.updateUser({ password: next }); });
      });
    },
    signOut: function () {
      clearLocal();
      /* Sign out this browser only and never wait longer than 2.5s: if Supabase's sign-out request fails or hangs,
         its stored session would survive and the landing page would log the member straight back in. */
      var remote = boot().then(function (c) { return c.auth.signOut({ scope: "local" }); }).catch(function () {});
      var timeout = new Promise(function (ok) { setTimeout(ok, 2500); });
      return Promise.race([remote, timeout]).then(wipeSession, wipeSession);
    }
  };
  function readLocalUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; } catch (e) { return {}; } }

  /* Google button + password-strength bar styles (kept here so no CSS file has to change) */
  var st = document.createElement("style");
  st.textContent =
    ".g-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin:6px 0 2px;padding:11px 14px;border:1px solid rgba(128,128,128,.35);border-radius:12px;background:#fff;color:#1f1f1f;font:600 15px/1 inherit;font-family:inherit;cursor:pointer}" +
    ".g-btn:hover{background:#f5f5f5}.g-btn:disabled{opacity:.6;cursor:wait}" +
    "[data-theme=dark] .g-btn{background:#fff;color:#1f1f1f}" +
    ".pwbar{display:none;margin-top:6px;font-size:12px}.pwbar.on{display:flex;align-items:center;gap:10px}" +
    ".pwbar-track{display:flex;gap:4px;flex:1}.pwbar-track i{flex:1;height:6px;border-radius:4px;background:rgba(128,128,128,.28);transition:background .2s}" +
    ".pwbar[data-l=\"1\"] i:nth-child(1){background:#e5484d}.pwbar[data-l=\"2\"] i:nth-child(-n+2){background:#f5a524}.pwbar[data-l=\"3\"] i{background:#30a46c}" +
    ".pwbar-label{min-width:56px;text-align:right;font-weight:700}" +
    ".pwbar[data-l=\"1\"] .pwbar-label{color:#e5484d}.pwbar[data-l=\"2\"] .pwbar-label{color:#f5a524}.pwbar[data-l=\"3\"] .pwbar-label{color:#30a46c}" +
    ".g-or{display:flex;align-items:center;gap:10px;margin:10px 0 4px;font-size:12px;opacity:.65}" +
    ".g-or:before,.g-or:after{content:\"\";flex:1;height:1px;background:currentColor;opacity:.25}";
  document.head.appendChild(st);

  /* ---------- on every page load ---------- */
  var hash = location.hash;
  var fromLink = hash.indexOf("access_token") > -1 && hash.indexOf("type=recovery") === -1; /* confirmation link or Google sign-in */
  var recovery = hash.indexOf("type=recovery") > -1;                                         /* password-reset link */
  var hasLink = hash.indexOf("access_token") > -1 || hash.indexOf("error") > -1;

  if (!guard && !hasLink && !hasStoredSession()) {
    /* anonymous visitor on the landing page: nothing to restore, so don't download the sign-in SDK yet (it loads on first use) */
    return API;
  }
  if (guard && !hasStoredSession()) {
    clearLocal();
    location.replace("index.html");
    return API;
  }

  boot().then(function (c) {
    return c.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (recovery) {
        /* the reset link signs the member in only to let them choose a new password: ask for it, don't open the app yet */
        history.replaceState(null, "", location.pathname + location.search);
        window.dispatchEvent(new CustomEvent("taskly-recovery"));
        return;
      }
      if (s && verified(s.user)) {
        publish(s.user);
        if (hasLink) history.replaceState(null, "", location.pathname + location.search);
        /* confirmed or signed in with Google: go straight to the dashboard instead of the landing page */
        if (fromLink && !guard) location.replace("app.html");
      } else if (guard) {
        clearLocal();
        location.replace("index.html");
      }
    });
  }).catch(function () { /* offline / not configured: keep whatever the page already had */ });

  return API;
})();
