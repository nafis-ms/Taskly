/* Taskly assistant robot: head, face and eyes follow the cursor (or finger).
   Pure SVG + JS, no external files. Idle glances, blinking, click-to-cheer. */
(function () {
  "use strict";
  var host = document.getElementById("bot");
  if (!host) return;
  var svg = host.querySelector("svg");
  var head = svg.querySelector("#botHead"),
    face = svg.querySelector("#botFace"),
    eyes = svg.querySelector("#botEyes"),
    body = svg.querySelector("#botBody"),
    ant = svg.querySelector("#botAnt");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, lastMove = 0;

  function apply() {
    head.setAttribute("transform", "translate(" + cx * 7 + " " + cy * 4 + ") rotate(" + cx * 6 + " 150 186)");
    face.setAttribute("transform", "translate(" + cx * 6 + " " + cy * 4 + ")");
    eyes.setAttribute("transform", "translate(" + cx * 4 + " " + cy * 3 + ")");
    body.setAttribute("transform", "translate(" + cx * 2.5 + " " + cy * 1.5 + ")");
    ant.setAttribute("transform", "rotate(" + -cx * 10 + " 150 66)");
  }

  function tick() {
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    apply();
    if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) raf = requestAnimationFrame(tick);
    else raf = 0;
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /* only the default pose and the "tired & sleepy" pose follow the cursor; every activity looks straight ahead */
  function follows() {
    var a = host.getAttribute("data-act");
    return a === "default" || a === "tired";
  }
  /* aim at a point on screen, measured from the robot's head */
  function lookAt(clientX, clientY) {
    if (!follows()) return;
    var ctm = svg.getScreenCTM();
    if (!ctm) return; /* dashboard tab is hidden */
    var pt = svg.createSVGPoint();
    pt.x = 150;
    pt.y = 120;
    var s = pt.matrixTransform(ctm);
    tx = Math.tanh((clientX - s.x) / 280);
    ty = Math.tanh((clientY - s.y) / 240);
    kick();
  }

  window.addEventListener(
    "pointermove",
    function (e) {
      lastMove = Date.now();
      lookAt(e.clientX, e.clientY);
    },
    { passive: true }
  );

  /* idle: glance around when the pointer has been still for a while */
  if (!reduce) {
    setInterval(function () {
      if (document.hidden || !follows() || Date.now() - lastMove < 4500 || !svg.getScreenCTM()) return;
      tx = (Math.random() - 0.5) * 1.3;
      ty = (Math.random() - 0.4) * 0.8;
      kick();
    }, 3200);

    (function blink() {
      setTimeout(function () {
        host.classList.add("blink");
        setTimeout(function () {
          host.classList.remove("blink");
          blink();
        }, 140);
      }, 2200 + Math.random() * 3800);
    })();
  }

  /* ---- left arm: the hand lifts straight up beside the head and waves, the robot leans right ---- */
  var armPath = svg.querySelector("#botArmL"),
    armHi = svg.querySelector("#botArmLh"),
    armHand = svg.querySelector("#botHandL"),
    tiltG = svg.querySelector("#botTilt");
  var REST = { cx: 72, cy: 216, hx: 72, hy: 248, hr: 0 },
    UP = { cx: 52, cy: 208, hx: 52, hy: 162, hr: 180 };
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function ease(x) {
    return x * x * (3 - 2 * x);
  }
  function pose(lift, wave) {
    var cx = lerp(REST.cx, UP.cx, lift) + wave * 3,
      cy = lerp(REST.cy, UP.cy, lift),
      hx = lerp(REST.hx, UP.hx, lift) + wave * 6,
      hy = lerp(REST.hy, UP.hy, lift),
      hr = lerp(REST.hr, UP.hr, lift) + wave * 14 * lift;
    var d = "M106 208 Q" + cx + " " + cy + " " + hx + " " + hy;
    armPath.setAttribute("d", d);
    armHi.setAttribute("d", d);
    armHand.setAttribute("transform", "translate(" + hx + " " + hy + ") rotate(" + hr + ")");
    tiltG.setAttribute("transform", "rotate(" + lift * 7 + " 150 270)");
  }
  var waving = false;
  function playWave(T) {
    if (waving || reduce || host.getAttribute("data-act") !== "default") return;
    waving = true;
    var t0 = performance.now();
    (function step(now) {
      var t = now - t0,
        lift,
        wave = 0;
      if (t >= T) {
        pose(0, 0);
        waving = false;
        return;
      }
      if (t < T * 0.2) lift = ease(t / (T * 0.2));
      else if (t > T * 0.8) lift = 1 - ease((t - T * 0.8) / (T * 0.2));
      else {
        lift = 1;
        wave = Math.sin(((t - T * 0.2) / (T * 0.6)) * Math.PI * 6);
      }
      pose(lift, wave);
      requestAnimationFrame(step);
    })(t0);
  }

  /* greeting: once, the first time the robot is actually on screen */
  function greet() {
    setTimeout(function () {
      playWave(3400);
    }, 500);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        greet();
      }
    });
    io.observe(host);
  } else greet();

  /* click / tap: happy face + a quick wave */
  var cheerT;
  host.addEventListener("click", function () {
    host.classList.add("cheer");
    clearTimeout(cheerT);
    cheerT = setTimeout(function () {
      host.classList.remove("cheer");
    }, 1700);
    playWave(2200);
  });

  /* ---- activities: pose chosen by the schedule's category (default = the original pose) ---- */
  var ACTS = ["default", "tired", "study", "work", "creativity", "fitness", "meal", "household", "social", "payment", "appointment", "event", "sleep"];
  function setActivity(name) {
    if (ACTS.indexOf(name) < 0) name = "default";
    if (host.getAttribute("data-act") === name) return;
    host.setAttribute("data-act", name);
    var groups = svg.querySelectorAll(".act");
    for (var i = 0; i < groups.length; i++) {
      groups[i].classList.toggle("on", (" " + groups[i].getAttribute("data-for") + " ").indexOf(" " + name + " ") > -1);
    }
    if (name === "default") pose(0, 0);
    if (!follows()) {
      /* centre the head and eyes again */
      tx = 0;
      ty = 0;
      kick();
    }
  }
  window.TasklyBot = { set: setActivity, get: function () { return host.getAttribute("data-act"); } };
  setActivity(window.__botAct || "default");

  apply();
})();