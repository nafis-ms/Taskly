/* Taskly app: floating bokeh bubbles (light theme). Runs only while Settings > Background effect is On. */
(function () {
  var pg = document.querySelector(".page");
  if (!pg) return;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var box = document.createElement("div");
  box.className = "bokeh";
  box.setAttribute("aria-hidden", "true");
  var cols = ["--bc1", "--bc2", "--bc3", "--bc4"],
    n = innerWidth < 700 ? 28 : 58,
    bs = [],
    W = innerWidth,
    H = innerHeight;
  for (var k = 0; k < n; k++) {
    var d = 0.3 + Math.random() * 0.9,
      size = Math.round((40 + d * 130 + Math.random() * 50) * 1.4),
      o = document.createElement("i"),
      s = document.createElement("b");
    o.style.width = o.style.height = size + "px";
    s.style.cssText =
      "--c:var(" + cols[k % 4] + ");--o:" + (0.35 + Math.random() * 0.4).toFixed(2) +
      ";--st:" + (d > 0.95 ? 10 : d > 0.65 ? 30 : 50) + "%;--bl:" + (d > 0.95 ? 16 : d > 0.65 ? 9 : 4) +
      "px;--dl:" + (0.9 + Math.random() * 1.6).toFixed(2) + "s;--fd:" + (7 + Math.random() * 8).toFixed(1) + "s";
    o.appendChild(s);
    box.appendChild(o);
    bs.push({
      el: o, d: d, size: size, x: Math.random(), y: Math.random() * (H + 2 * size),
      p: Math.random() * 6.28, sp: 8 + Math.random() * 10,
      ox: 0, vx: 0, vy: 0,
      fr: 0.9 + Math.random() * 0.8 /* friction: each bubble slows down at its own pace */
    });
  }
  pg.insertBefore(box, pg.firstChild);
  var mx = 0, my = 0, cmx = 0, cmy = 0, last = 0, lastY = scrollY, running = false;
  var root = document.documentElement;
  function want() {
    return root.getAttribute("data-fx") === "on" && root.getAttribute("data-theme") !== "dark";
  }
  function sync() {
    if (want() && !running) {
      running = true;
      last = 0;
      lastY = scrollY;
      requestAnimationFrame(draw);
    } else if (!want()) running = false;
  }
  function clamp(v, m) { return v > m ? m : v < -m ? -m : v; }
  function draw(now) {
    if (!running) return;
    var dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    var t = now / 1000,
      k2 = 1 - Math.exp(-dt * 3),
      ds = clamp(scrollY - lastY, 140);
    lastY = scrollY;
    cmx += (mx - cmx) * k2;
    cmy += (my - cmy) * k2;
    bs.forEach(function (b) {
      if (ds) {
        /* scrolling pushes the bubble: nearer (bigger d) bubbles get a stronger kick */
        b.vy = clamp(b.vy + ds * b.d * 5, 1400);
        b.vx = clamp(b.vx + Math.sin(b.p * 3.1) * ds * b.d * 1.8, 700);
      }
      b.vx -= b.ox * 1.4 * dt; /* gentle pull back toward its home column */
      var damp = Math.exp(-dt * b.fr); /* the push fades out slowly */
      b.vx *= damp;
      b.vy *= damp;
      b.ox += b.vx * dt;
      b.y += (-b.sp * b.d + b.vy) * dt;
      var span = H + 2 * b.size,
        y = ((b.y % span) + span) % span - b.size + cmy * b.d * 40,
        x = b.x * W + Math.sin(t * 0.22 * b.d + b.p) * 70 * b.d + b.ox + cmx * b.d * 70 - b.size / 2;
      b.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
    });
    if (!reduce) requestAnimationFrame(draw);
    else running = false;
  }
  addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    mx = e.clientX / innerWidth - 0.5;
    my = e.clientY / innerHeight - 0.5;
  });
  addEventListener("resize", function () { W = innerWidth; H = innerHeight; });
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-fx"] });
  sync();
})();