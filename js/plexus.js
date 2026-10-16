/* Taskly dark theme: cinematic plexus network (nodes, lines, light pulses, depth of field).
   Runs only while data-theme="dark". Reacts to scroll (push + slow decay) and the pointer. */
(function () {
  var pg = document.querySelector(".page");
  if (!pg || !window.requestAnimationFrame) return;
  var root = document.documentElement,
    reduce = matchMedia("(prefers-reduced-motion:reduce)").matches,
    cv = document.createElement("canvas"),
    ctx = cv.getContext("2d");
  cv.className = "plexus";
  cv.setAttribute("aria-hidden", "true");
  pg.insertBefore(cv, pg.firstChild);

  var W, H, DPR, nodes = [], dust = [], pulses = [], edges = [];
  var running = false, last = 0, lastY = scrollY, mx = -1e4, my = -1e4, t0 = 0, spawn = 0;

  function sprite(r, stops) {
    var c = document.createElement("canvas");
    c.width = c.height = r * 2;
    var g = c.getContext("2d"),
      gr = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  }
  var dot = sprite(32, [[0, "rgba(255,255,255,1)"], [0.1, "rgba(235,252,255,.95)"], [0.28, "rgba(120,210,240,.38)"], [1, "rgba(60,170,220,0)"]]);
  var blob = sprite(64, [[0, "rgba(90,190,225,.6)"], [0.5, "rgba(60,160,205,.24)"], [1, "rgba(40,130,180,0)"]]);

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var n = Math.min(W < 700 ? 70 : 170, Math.max(40, Math.round(W * H / 11000)));
    if (nodes.length !== n || cv._w !== W || cv._h !== H) {
      cv._w = W; cv._h = H;
      nodes = [];
      /* jittered grid: every cell of the screen gets a node, so no empty spots */
      var cols = Math.ceil(Math.sqrt(n * W / H)), rows = Math.ceil(n / cols), cw = W / cols, ch = H / rows;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var z = Math.pow(Math.random(), 0.85), dir = Math.random() < 0.5 ? -1 : 1;
        nodes.push({
          x: (c + Math.random()) * cw, y: (r + Math.random()) * ch, z: z,
          vx: (Math.random() - 0.5) * 8 * (0.4 + z), vy: dir * (4 + Math.random() * 9) * (0.5 + z),
          ox: 0, oy: 0, pvx: 0, pvy: 0, ph: Math.random() * 6.28, sx: 0, sy: 0
        });
      }
      nodes.sort(function (a, b) { return a.z - b.z; });
    }
    /* fine dust: many tiny twinkling particles drifting up and down to fill every gap */
    var dn = Math.min(W < 700 ? 90 : 260, Math.max(60, Math.round(W * H / 7000)));
    if (dust.length !== dn || cv._dw !== W || cv._dh !== H) {
      cv._dw = W; cv._dh = H;
      dust = [];
      var dc = Math.ceil(Math.sqrt(dn * W / H)), dr = Math.ceil(dn / dc), dcw = W / dc, dch = H / dr;
      for (var q = 0; q < dr; q++) for (var w = 0; w < dc; w++) {
        var dz = Math.random();
        dust.push({
          x: (w + Math.random()) * dcw, y: (q + Math.random()) * dch, z: dz,
          vy: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 10), vx: (Math.random() - 0.5) * 4,
          ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6, sz: 4 + dz * 7
        });
      }
    }
  }

  function frame(now) {
    if (!running) return;
    if (!t0) t0 = now;
    var dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    var t = now / 1000,
      intro = Math.min((now - t0) / 2800, 1),
      ease = 1 - Math.pow(1 - intro, 3),
      ds = 0;
    lastY = scrollY;
    ctx.clearRect(0, 0, W, H);

    var maxD = W < 700 ? 120 : 175, i, j, n = nodes.length, a, b;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      var f = 0.3 + a.z;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < -60) a.x = W + 60; else if (a.x > W + 60) a.x = -60;
      if (a.y < -60) a.y += H + 120; else if (a.y > H + 60) a.y -= H + 120;
      a.pvx -= a.ox * 1.2 * dt;
      a.pvy -= a.oy * 1.2 * dt;
      var dm = Math.exp(-dt * 2.2);
      a.pvx *= dm; a.pvy *= dm;
      a.ox += a.pvx * dt;
      a.oy += a.pvy * dt;
      a.sx = a.x + a.ox + Math.sin(t * 0.1 + a.ph) * 8 * f;
      var wy = a.y + a.oy + Math.cos(t * 0.12 + a.ph) * 10 * f - scrollY * (0.05 + a.z * 0.2);
      a.sy = ((wy + 60) % (H + 120) + (H + 120)) % (H + 120) - 60;
      var px = a.sx - mx, py = a.sy - my, pd = px * px + py * py;
      if (pd < 22500 && pd > 1) { var pdd = Math.sqrt(pd), push = (1 - pdd / 150) * 30 * f * dt * 10; a.ox += (px / pdd) * push * 0.2; a.oy += (py / pdd) * push * 0.2; }
    }

    /* dust layer: drifts up and down, parallax on scroll, wraps so the screen is always filled */
    var span = H + 40;
    for (i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.y += d.vy * dt;
      if (d.y < -20) d.y += span; else if (d.y > H + 20) d.y -= span;
      d.x += d.vx * dt;
      if (d.x < -20) d.x = W + 20; else if (d.x > W + 20) d.x = -20;
      var dy2 = d.y + Math.sin(t * 0.2 + d.ph) * 6 - scrollY * (0.04 + d.z * 0.18);
      dy2 = ((dy2 + 20) % span + span) % span - 20;
      ctx.globalAlpha = (0.25 + d.z * 0.5) * (0.5 + 0.5 * Math.sin(t * d.sp * 0.5 + d.ph)) * ease;
      ctx.drawImage(dot, d.x - d.sz / 2, dy2 - d.sz / 2, d.sz, d.sz);
    }

    /* far blurred blobs, like out-of-focus lights */
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (a.z > 0.8) {
        var r = 26 + a.z * 46;
        ctx.globalAlpha = 0.5 * ease * (0.7 + 0.3 * Math.sin(t * 0.8 + a.ph));
        ctx.drawImage(blob, a.sx - r, a.sy - r, r * 2, r * 2);
      }
    }

    /* connection lines, batched into alpha buckets */
    var paths = [], k;
    for (k = 0; k < 6; k++) paths.push(new Path2D());
    edges.length = 0;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (a.z > 0.8) continue;
      for (j = i + 1; j < n; j++) {
        b = nodes[j];
        if (b.z > 0.8) continue;
        var dx = a.sx - b.sx, dy = a.sy - b.sy, lim = maxD * (0.65 + 0.35 * (a.z + b.z)), d2 = dx * dx + dy * dy;
        if (d2 < lim * lim) {
          var q = 1 - Math.sqrt(d2) / lim,
            bk = Math.min(5, Math.floor(q * q * 6 * (0.5 + (a.z + b.z) * 0.6)));
          paths[bk].moveTo(a.sx, a.sy);
          paths[bk].lineTo(b.sx, b.sy);
          if (q > 0.35) edges.push(i, j);
        }
      }
    }
    ctx.lineWidth = 1;
    for (k = 0; k < 6; k++) {
      ctx.globalAlpha = (0.06 + k * 0.085) * ease;
      ctx.strokeStyle = "rgb(130,205,235)";
      ctx.stroke(paths[k]);
    }

    /* lines from the pointer to nearby nodes */
    if (mx > -1e3) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgb(190,240,255)";
      for (i = 0; i < n; i++) {
        a = nodes[i];
        if (a.z > 0.8) continue;
        var ex = a.sx - mx, ey = a.sy - my, ed = Math.sqrt(ex * ex + ey * ey);
        if (ed < 170) {
          ctx.globalAlpha = (1 - ed / 170) * 0.55 * ease;
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(a.sx, a.sy); ctx.stroke();
        }
      }
    }

    /* light pulses travelling along connections */
    spawn -= dt;
    if (spawn <= 0 && edges.length > 2 && pulses.length < 14) {
      var e = (Math.floor(Math.random() * (edges.length / 2))) * 2;
      pulses.push({ a: edges[e], b: edges[e + 1], p: 0, s: 0.45 + Math.random() * 0.5 });
      spawn = 0.18 + Math.random() * 0.4;
    }
    for (k = pulses.length - 1; k >= 0; k--) {
      var pl = pulses[k];
      pl.p += dt * pl.s;
      if (pl.p >= 1) { pulses.splice(k, 1); continue; }
      a = nodes[pl.a]; b = nodes[pl.b];
      ctx.globalAlpha = Math.sin(pl.p * Math.PI) * 0.95 * ease;
      ctx.drawImage(dot, a.sx + (b.sx - a.sx) * pl.p - 9, a.sy + (b.sy - a.sy) * pl.p - 9, 18, 18);
    }

    /* crisp glowing nodes */
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (a.z > 0.8) continue;
      var s = (12 + a.z * 26) * (0.4 + 0.6 * ease);
      ctx.globalAlpha = (0.45 + a.z * 0.55) * (0.78 + 0.22 * Math.sin(t * 1.3 + a.ph)) * ease;
      ctx.drawImage(dot, a.sx - s / 2, a.sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(frame);
  }

  function sync() {
    /* in the app (it has a Settings button) the network only runs when Background effect is on */
    var inApp = !!document.getElementById("settingsBtn"),
      dark = root.getAttribute("data-theme") === "dark" && (!inApp || root.getAttribute("data-fx") === "on");
    if (dark && !running) {
      running = true; last = 0; t0 = 0; lastY = scrollY;
      requestAnimationFrame(frame);
    } else if (!dark && running) {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  resize();
  addEventListener("resize", resize);
  addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") { mx = e.clientX; my = e.clientY; } });
  document.addEventListener("mouseleave", function () { mx = my = -1e4; });
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-fx"] });
  sync();
})();