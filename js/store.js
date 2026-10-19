/**
 * Taskly browser store -> window.TasklyStore
 * Loaded by index.html, app.html and admin.html.
 *
 * Talks to the Vercel API:
 *   /api         feedback (public submit, admin list / keep / reject / delete / add)
 *   /api/users   real accounts from Supabase Auth (admin only)
 * Admin requests send the header  x-admin-key: <ADMIN_PASSWORD>
 */
(function () {
  "use strict";

  var KEY_ADMIN = "taskly:key"; /* sessionStorage: admin password for this tab */
  var KEY_FLAG = "taskly:adm";  /* sessionStorage: admin is logged in */

  var accountsCache = {}; /* lower-cased email -> account (from /api/users) */
  var feedbackCache = []; /* all feedback (from /api, admin) */
  var api_lastErr = "";   /* last admin login failure, shown on the login screen */

  /* ---------- tiny localStorage helpers ---------- */
  function get(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  }
  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function day(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    var m = d.getMonth() + 1, n = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (n < 10 ? "0" : "") + n;
  }
  function lc(s) { return String(s || "").trim().toLowerCase(); }

  /* ---------- admin session ---------- */
  function adminKey() {
    try { return sessionStorage.getItem(KEY_ADMIN) || ""; } catch (e) { return ""; }
  }
  function adminLogoutLocal() {
    try { sessionStorage.removeItem(KEY_FLAG); sessionStorage.removeItem(KEY_ADMIN); } catch (e) {}
  }

  /* fetch JSON; resolves {status, data}; status 0 = could not reach the server */
  function api(method, url, body, key) {
    var headers = {};
    var k = key == null ? adminKey() : key;
    try {
      if (k) headers["x-admin-key"] = k;
      if (body) headers["Content-Type"] = "application/json";
      return fetch(url, {
        method: method,
        cache: "no-store",
        headers: headers,
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          return { status: r.status, data: d || {} };
        });
      }, function () { return { status: 0, data: {} }; });
    } catch (e) {
      return Promise.resolve({ status: 0, data: {} });
    }
  }

  function setAccounts(items) {
    var map = {};
    (items || []).forEach(function (u) {
      if (!u || !u.email) return;
      map[lc(u.email)] = {
        id: u.id, email: u.email, name: u.name || "",
        created: u.created || 0, last: u.last || 0,
        suspended: !!u.suspended, verified: !!u.verified, provider: u.provider || "email",
        tasks: u.tasks || 0, done: u.done || 0,
        days: Array.isArray(u.days) ? u.days : []
      };
    });
    accountsCache = map;
  }

  /* admin login: cb(httpStatus)  200 = ok, 401 = wrong password, anything else = server problem */
  function adminLogin(password, cb) {
    api("GET", "/api/users", null, String(password)).then(function (r) {
      if (r.status === 200) setAccounts(r.data.items);
      else api_lastErr = r.status ? "HTTP " + r.status + (r.data.error ? ": " + r.data.error : "") + (r.data.detail ? " (" + r.data.detail + ")" : "") : "no response (network, blocked request or invalid characters in the password)";
      cb(r.status);
    });
  }

  /* refresh feedback + accounts for the admin panel */
  function pullFeedback(cb) {
    if (!adminKey()) { if (cb) cb(); return; }
    Promise.all([api("GET", "/api"), api("GET", "/api/users")]).then(function (res) {
      if (res[0].status === 401 || res[1].status === 401) { /* password changed or session stale */
        adminLogoutLocal();
        location.reload();
        return;
      }
      if (res[0].status === 200) feedbackCache = res[0].data.items || [];
      if (res[1].status === 200) setAccounts(res[1].data.items);
      if (cb) cb();
    });
  }

  /* admin: keep / reject (PATCH + status) or delete (DELETE). cb(ok, message) */
  function feedbackAct(id, method, cb, status) {
    var url = "/api?id=" + encodeURIComponent(id) + (status ? "&status=" + encodeURIComponent(status) : "");
    api(method, url).then(function (r) {
      if (r.status === 200) {
        if (method === "DELETE") feedbackCache = feedbackCache.filter(function (x) { return x.id !== String(id); });
        else feedbackCache.forEach(function (x) { if (x.id === String(id) && status) x.status = status; });
        if (cb) cb(true);
      } else if (cb) {
        cb(false, r.data.detail || r.data.error || (r.status ? "Server error " + r.status : "Can't reach the server"));
      }
    });
  }

  /* admin: post straight to the slideshow. cb(ok) */
  function adminAddFeedback(name, rating, text, cb) {
    api("POST", "/api", { name: name || "Anonymous", rating: rating, text: text, status: "kept" }).then(function (r) {
      if (r.status === 201 || r.status === 200) {
        if (r.data && r.data.item) feedbackCache.push(r.data.item);
        if (cb) cb(true);
      } else if (cb) cb(false);
    });
  }

  /* anyone: submit feedback (goes to "pending" until the admin keeps it). cb(sent) */
  function addFeedback(email, name, rating, text, cb) {
    api("POST", "/api", { email: email || "", name: name || "", rating: rating, text: text }, "").then(function (r) {
      if (cb) cb(r.status === 201 || r.status === 200);
    });
  }

  function accountAct(id, action, cb) {
    api("POST", "/api/users?id=" + encodeURIComponent(id) + "&action=" + encodeURIComponent(action)).then(function (r) {
      if (r.status === 200) {
        Object.keys(accountsCache).forEach(function (k) {
          var u = accountsCache[k];
          if (u.id !== id) return;
          if (action === "ban") u.suspended = true;
          if (action === "unban") u.suspended = false;
          if (action === "delete") delete accountsCache[k];
        });
        if (cb) cb(true);
      } else if (cb) {
        cb(false, r.data.error || (r.status ? "Server error " + r.status : "Can't reach the server"));
      }
    });
  }

  window.TasklyStore = {
    get: get, set: set, day: day,
    adminLogin: adminLogin, adminKey: adminKey, lastError: function () { return api_lastErr; },
    pullFeedback: pullFeedback, feedback: function () { return feedbackCache; },
    feedbackAct: feedbackAct, adminAddFeedback: adminAddFeedback, addFeedback: addFeedback,
    accounts: function () { return accountsCache; }, accountAct: accountAct
  };
})();
