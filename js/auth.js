/* Taskly auth: Supabase Auth (Google sign-in + email confirmation).
   Loaded after store.js on index.html and app.html.
   On app.html add data-guard to the script tag to redirect visitors without a verified session. */
var TasklyAuth = (function () {
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

  function load(src) {
    return new Promise(function (ok, no) {
      if (window.supabase) return ok();
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = function () { no(new Error("Could not load the sign-in service.")); };
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
      return client;
    });
    booting.catch(function () { booting = null; });
    return booting;
  }

  function nameOf(u) {
    var m = (u && u.user_metadata) || {};
    return m.full_name || m.name || String((u && u.email) || "").split("@")[0];
  }
  /* a session only counts when the email is verified (Google accounts always are) */
  function verified(u) { return !!(u && (u.email_confirmed_at || u.confirmed_at)); }

  function publish(u) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify({ email: u.email, name: nameOf(u) }));
      var m = JSON.parse(localStorage.getItem("taskly:names") || "{}") || {};
      m[u.email.toLowerCase()] = nameOf(u);
      localStorage.setItem("taskly:names", JSON.stringify(m));
    } catch (e) {}
    if (window.TasklyStore) { TasklyStore.signup(u.email, nameOf(u)); }
    window.dispatchEvent(new CustomEvent("taskly-auth", { detail: { email: u.email, name: nameOf(u) } }));
  }
  function clearLocal() { try { localStorage.removeItem(USER_KEY); } catch (e) {} }

  function friendly(err) {
    var m = String((err && err.message) || err || "");
    if (/email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox (and spam) for the link.";
    if (/invalid login credentials/i.test(m)) return "Incorrect email or password.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a few minutes and try again.";
    if (/password/i.test(m) && /(least|short|weak)/i.test(m)) return "Choose a stronger password (8+ characters).";
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
  var API = {
    strength: strength,
    isDisposable: isDisposable,
    friendly: friendly,
    signUp: function (email, pw, name) {
      if (isDisposable(email)) return Promise.resolve({ error: { message: "Please use a real email address, not a temporary one." } });
      return boot().then(function (c) {
        return c.auth.signUp({
          email: email, password: pw,
          options: { data: { full_name: name }, emailRedirectTo: location.origin + "/index.html" }
        });
      }).then(function (r) {
        if (r.error) return { error: r.error };
        /* Supabase hides existing accounts: a fake "user" with no identities comes back */
        if (r.data && r.data.user && r.data.user.identities && !r.data.user.identities.length)
          return { error: { message: "An account with this email already exists. Try logging in." } };
        return { needsConfirm: !(r.data && r.data.session) };
      }).catch(function (e) { return { error: e }; });
    },
    signIn: function (email, pw) {
      return boot().then(function (c) { return c.auth.signInWithPassword({ email: email, password: pw }); })
        .then(function (r) {
          if (r.error) return { error: r.error };
          if (!verified(r.data.user)) return { error: { message: "Email not confirmed" } };
          publish(r.data.user);
          return { user: r.data.user };
        }).catch(function (e) { return { error: e }; });
    },
    google: function () {
      return boot().then(function (c) {
        return c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/index.html" } });
      }).catch(function (e) { return { error: e }; });
    },
    resetPassword: function (email) {
      return boot().then(function (c) {
        return c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/index.html" });
      }).catch(function (e) { return { error: e }; });
    },
    resend: function (email) {
      return boot().then(function (c) {
        return c.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: location.origin + "/index.html" } });
      }).catch(function (e) { return { error: e }; });
    },
    signOut: function () {
      clearLocal();
      return boot().then(function (c) { return c.auth.signOut(); }).catch(function () {});
    }
  };

  /* Google button styles (kept here so no CSS file has to change) */
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

  /* on every page load: pick up a session (also the one coming back from Google / the email link) */
  boot().then(function (c) {
    return c.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (s && verified(s.user)) {
        publish(s.user);
        if (location.hash.indexOf("access_token") > -1 || location.hash.indexOf("error") > -1)
          history.replaceState(null, "", location.pathname + location.search);
      } else if (guard) {
        clearLocal();
        location.replace("index.html");
      }
    });
  }).catch(function () { /* offline / not configured: keep whatever the page already had */ });

  return API;
})();
