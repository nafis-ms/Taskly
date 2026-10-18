/* Fills the landing page "Contact us" section with the details the admin saved (GET /api/contact).
   If nothing was saved yet, or the request fails, the default text already in index.html stays. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function show(id, on) { var w = $(id + "-w"); if (w) w.style.display = on ? "" : "none"; }

  fetch("/api/contact", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var i = d && d.info;
      if (!i || typeof i !== "object" || !Object.keys(i).length) return;

      if (typeof i.lede === "string" && $("ci-lede")) {
        $("ci-lede").textContent = i.lede;
        $("ci-lede").style.display = i.lede ? "" : "none";
      }
      if (typeof i.email === "string") {
        var e = $("ci-email");
        if (e) { e.textContent = i.email; e.href = "mailto:" + i.email; }
        show("ci-email", !!i.email);
      }
      if (typeof i.phone === "string") {
        var p = $("ci-phone");
        if (p) { p.textContent = i.phone; p.href = "tel:" + i.phone.replace(/[^\d+]/g, ""); }
        show("ci-phone", !!i.phone);
      }
      if (typeof i.address === "string") {
        var a = $("ci-addr");
        if (a) { a.textContent = i.address; a.style.whiteSpace = "pre-line"; }
        show("ci-addr", !!i.address);
      }
      if (typeof i.hours === "string") {
        if ($("ci-hours")) $("ci-hours").textContent = i.hours;
        show("ci-hours", !!i.hours);
      }
    })
    .catch(function () {});
})();
