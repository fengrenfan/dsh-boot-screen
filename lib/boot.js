/**
 * dsh-boot-screen — browser half.
 *
 * Runs as a classic script injected as the first child of <body>: before
 * #root exists and before the shell's deferred module entry executes. It
 * paints an opaque full-screen canvas sequence, then reveals the app once the
 * sequence is done and the shell has mounted something under #root.
 *
 * No dependencies, no network requests, no framework.
 */
(function () {
  'use strict';

  var CFG = window.__DSH_BOOT_SCREEN__ || {};
  if (CFG.enabled === false) return;
  if (document.getElementById('dsh-boot')) return;

  var SEEN_KEY = 'dsh-boot-screen-seen';
  if (CFG.oncePerSession) {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch (err) { /* private mode */ }
  }

  var now = function () {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeInOut = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  // Slight overshoot so the swarm lands with a snap instead of a fade-in.
  var easeOutBack = function (t) {
    var s = 1.15;
    var c = s + 1;
    var u = t - 1;
    return 1 + c * u * u * u + s * u * u;
  };
  var TAU = Math.PI * 2;

  /* ---------------- timeline ---------------- */
  var SPEED = CFG.speed > 0.1 ? CFG.speed : 1;
  var T = {
    deepseek: 0.80 * SPEED,
    harness: 2.70 * SPEED,
    sphere: 4.40 * SPEED,
    loadStart: 5.90 * SPEED,
    loadEnd: 7.70 * SPEED,
    ignite: 8.00 * SPEED,
    done: 9.30 * SPEED,
    holdMax: 12 * SPEED
  };

  /* ---------------- dom ---------------- */
  var root = document.createElement('div');
  root.id = 'dsh-boot';
  root.setAttribute('role', 'presentation');
  root.innerHTML =
    '<canvas class="dshb-fx"></canvas>' +
    '<canvas class="dshb-hud"></canvas>' +
    '<div class="dshb-scan"></div>' +
    '<div class="dshb-vignette"></div>' +
    '<div class="dshb-grain"></div>' +
    '<div class="dshb-corner dshb-tl"><b><i></i>DSH CORE</b><em>NODE 01 · LOCAL · V1.3</em></div>' +
    '<div class="dshb-corner dshb-tr"><b>BOOT <span class="dshb-time">00.00</span></b><em class="dshb-phase">STANDBY</em></div>' +
    '<div class="dshb-corner dshb-bl"><b>MEM <span class="dshb-mem">--</span></b><em>TENSOR FIELD / 128K CTX</em></div>' +
    '<div class="dshb-corner dshb-br"><b>SIGNAL <span class="dshb-sig">--</span></b><em>LOCAL · ENCRYPTED</em></div>' +
    '<div class="dshb-hero-glow"></div>' +
    '<div class="dshb-hero-wrap">' +
      '<img class="dshb-hero" alt="" draggable="false" />' +
      '<div class="dshb-hero-sheen"></div>' +
      '<div class="dshb-hero-scan"></div>' +
    '</div>' +
    '<div class="dshb-intro"><div class="dshb-intro-inner">' +
      '<div class="dshb-glyph"><span class="r1"></span><span class="r2"></span><span class="r3"></span><i></i></div>' +
      '<div class="dshb-intro-kicker">DEEPSEEK HARNESS // CORE</div>' +
      '<div class="dshb-intro-title">BOOT SEQUENCE</div>' +
      '<button class="dshb-start" type="button"><span>▸ 点击启动</span></button>' +
      '<div class="dshb-intro-note">点击后播放完整启动序列，同时开启声音</div>' +
    '</div></div>' +
    '<div class="dshb-title">' +
      '<div class="dshb-kicker">CORE BOOT COMPLETE</div>' +
      '<h1 data-text="HARNESS\nONLINE"><span>HARNESS</span><span>ONLINE</span></h1>' +
      '<div class="dshb-sub">「 神 器 启 动。 」</div>' +
      '<div class="dshb-meta">DEEPSEEK-FLASH · 128K CONTEXT · 6 TOOLS ONLINE</div>' +
    '</div>' +
    '<div class="dshb-loader">' +
      '<div class="dshb-loader-top"><span class="dshb-label">LOADING CORE</span>' +
      '<span class="dshb-pct">0<i>%</i></span></div>' +
      '<div class="dshb-bar"><i></i></div>' +
    '</div>' +
    '<button class="dshb-sound" type="button" aria-label="开启声音"><b></b>点击开启声音</button>' +
    '<div class="dshb-hint">ESC 跳过</div>';
  document.body.appendChild(root);

  var fx = root.querySelector('.dshb-fx');
  var hudc = root.querySelector('.dshb-hud');
  var c = fx.getContext('2d');
  var h = hudc.getContext('2d');
  var titleEl = root.querySelector('.dshb-title');
  var barEl = root.querySelector('.dshb-bar i');
  var pctEl = root.querySelector('.dshb-pct');
  var labelEl = root.querySelector('.dshb-label');
  var phaseEl = root.querySelector('.dshb-phase');
  var timeEl = root.querySelector('.dshb-time');
  var memEl = root.querySelector('.dshb-mem');
  var sigEl = root.querySelector('.dshb-sig');
  var soundChip = root.querySelector('.dshb-sound');
  var startBtn = root.querySelector('.dshb-start');
  var heroEl = root.querySelector('.dshb-hero');
  var sheenEl = root.querySelector('.dshb-hero-sheen');
  var scanEl = root.querySelector('.dshb-hero-scan');
  var PORTRAIT = globalThis.__DSH_BOOT_PORTRAIT__ || '';
  if (PORTRAIT && heroEl) {
    var art = 'url("' + PORTRAIT + '")';
    heroEl.src = PORTRAIT;
    [sheenEl, scanEl].forEach(function (el) {
      if (!el) return;
      el.style.maskImage = art;
      el.style.webkitMaskImage = art;
    });
  }

  var W = 0, H = 0, DPR = 1;

  /* ---------------- sprites ---------------- */
  function makeSprite(rgb, coreA) {
    var S = 64;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var g = cv.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(' + rgb + ',' + coreA + ')');
    grd.addColorStop(0.22, 'rgba(' + rgb + ',' + coreA * 0.55 + ')');
    grd.addColorStop(0.55, 'rgba(' + rgb + ',' + coreA * 0.13 + ')');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return cv;
  }
  var sprites = [makeSprite('168,238,255', 1), makeSprite('120,158,255', 0.95), makeSprite('196,158,255', 0.9)];
  var coreColors = ['#eafcff', '#a9c6ff', '#d3b8ff'];

  /* ---------------- particles ---------------- */
  var N = 0;
  var parts = [];
  var samples = { a: null, b: null };
  var kind = 'none';
  // Two-column composition: particle type on the left, the character on the
  // right. Narrow screens stack her behind a centred column instead.
  var L = { wide: true, textX: 0, textY: 0, heroX: 0, heroY: 0, haloRx: 0, haloRy: 0, ringR: 0 };

  function computeLayout() {
    L.wide = W >= 900;
    if (L.wide) {
      L.textX = W * 0.285;
      L.textY = H * 0.46;
      L.heroX = W * 0.755;
      L.heroY = H * 0.5;
      L.haloRx = Math.min(W * 0.165, 250);
      L.haloRy = Math.min(H * 0.34, 310);
      L.ringR = Math.min(W * 0.2, H * 0.33, 300);
    } else {
      L.textX = W * 0.5;
      L.textY = H * 0.44;
      L.heroX = W * 0.5;
      L.heroY = H * 0.45;
      L.haloRx = Math.min(W * 0.36, 300);
      L.haloRy = Math.min(H * 0.2, 210);
      L.ringR = Math.min(W, H) * 0.3;
    }
  }

  var centerY = function () { return L.textY; };

  var motes = [];
  function buildMotes() {
    motes = [];
    for (var i = 0; i < 46; i++) {
      motes.push({
        x: L.heroX + rand(-L.haloRx * 1.6, L.haloRx * 1.3),
        y: rand(0, H),
        sp: rand(5, 20),
        r: rand(0.7, 2.2),
        ph: rand(0, TAU),
        a: rand(0.1, 0.42)
      });
    }
  }

  function buildParticles() {
    N = W < 760 ? 1400 : 2600;
    parts = [];
    for (var i = 0; i < N; i++) {
      var a = rand(0, TAU);
      var r = rand(0, Math.min(W, H) * 0.55);
      var tr = Math.random();
      var sx = W / 2 + Math.cos(a) * r;
      var sy = centerY() + Math.sin(a) * r * 0.8;
      parts.push({
        i: i,
        x: sx,
        y: sy,
        tx: W / 2, ty: centerY(),
        fromX: sx, fromY: sy,
        dur: rand(0.55, 0.80),
        size: rand(0.9, 2.2),
        cw: rand(1, 1.9),
        alpha: rand(0.16, 0.52),
        tint: tr < 0.72 ? 0 : (tr < 0.93 ? 1 : 2),
        depth: 1,
        ang: 0,
        spin: rand(0.06, 0.24) * (Math.random() < 0.35 ? -1 : 1),
        rj: rand(0.965, 1.035),
        yj: rand(-0.06, 0.06),
        ph: rand(0, TAU),
        spark: Math.random() < 0.07,
        goAt: 1e9,
        delay: Math.pow(Math.random(), 1.5) * 0.50
      });
    }
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function evenly(list, n) {
    if (list.length <= n) return list;
    var out = [], stride = list.length / n;
    for (var i = 0; i < n; i++) out.push(list[Math.floor(i * stride)]);
    return out;
  }

  /* ---------------- text sampling ---------------- */
  function sampleText(text) {
    var fs = Math.min(W * 0.115, 168);
    var spacing = fs * 0.14;
    var font = '800 ' + fs + 'px "Helvetica Neue", Inter, Arial, sans-serif';
    var oc = document.createElement('canvas');
    var g = oc.getContext('2d');
    g.font = font;
    var chars = text.split('');
    var widths = chars.map(function (ch) { return g.measureText(ch).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    var w = Math.ceil(total) + 48;
    var hgt = Math.ceil(fs * 1.7);
    oc.width = w;
    oc.height = hgt;
    g = oc.getContext('2d');
    g.font = font;
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    var x = 24;
    for (var i = 0; i < chars.length; i++) {
      g.fillText(chars[i], x, hgt / 2);
      x += widths[i] + spacing;
    }
    var data;
    try { data = g.getImageData(0, 0, w, hgt).data; } catch (err) { return { pts: [], w: w, h: hgt }; }

    var count = 0;
    for (var yy = 0; yy < hgt; yy += 2) {
      for (var xx = 0; xx < w; xx += 2) {
        if (data[(yy * w + xx) * 4 + 3] > 130) count++;
      }
    }
    var step = Math.max(2, Math.ceil(2 * Math.sqrt(count / Math.max(400, N))));
    var pts = [];
    for (var y = 0; y < hgt; y += step) {
      for (var x2 = 0; x2 < w; x2 += step) {
        if (data[(y * w + x2) * 4 + 3] > 130) {
          pts.push({ x: x2 - w / 2 + rand(-1.7, 1.7), y: y - hgt / 2 + rand(-1.7, 1.7) });
        }
      }
    }
    return { pts: pts, w: w, h: hgt };
  }

  function buildSamples() {
    samples.a = sampleText('DEEPSEEK');
    samples.b = sampleText('HARNESS');
  }

  function morphTo(next, t) {
    kind = next;
    var i, p;
    if (next === 'sphere') {
      for (i = 0; i < N; i++) {
        p = parts[i];
        p.fromX = p.x; p.fromY = p.y;
        p.goAt = t + p.delay * 0.7;
      }
      return;
    }
    if (next === 'halo') {
      for (i = 0; i < N; i++) {
        p = parts[i];
        p.ang = (i / N) * TAU + rand(-0.06, 0.06) + p.yj * 2;
        p.fromX = p.x; p.fromY = p.y;
        p.goAt = t + rand(0, 0.35);
      }
      return;
    }
    var s = next === 'a' ? samples.a : samples.b;
    if (!s || !s.pts.length) return;
    var scale = Math.min(1, (L.wide ? W * 0.5 : W * 0.84) / s.w, (H * 0.34) / s.h);
    var pts = shuffle(evenly(s.pts, N));
    var cx = L.textX, cy = L.textY;
    for (i = 0; i < N; i++) {
      var pt = pts[i % pts.length];
      p = parts[i];
      p.tx = cx + pt.x * scale;
      p.ty = cy + pt.y * scale;
      p.depth = 1;
      p.goAt = t + p.delay;
    }
  }

  /* ---------------- targeting ---------------- */
  var GOLDEN = 2.399963229728653;

  function sphereTarget(p, t) {
    var y = 1 - (p.i / (N - 1)) * 2;
    var rr = Math.sqrt(Math.max(0, 1 - y * y));
    var th = p.i * GOLDEN + t * 0.42;
    var x = Math.cos(th) * rr;
    var z = Math.sin(th) * rr;
    var tilt = -0.42;
    var y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
    var z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
    var R = Math.min(W, H) * (L.wide ? 0.2 : 0.26);
    var persp = 1 / (1.75 - z2 * 0.5);
    p.tx = L.textX + x * R * persp;
    p.ty = L.textY + y2 * R * persp;
    p.depth = clamp((z2 + 1) / 2, 0, 1);
  }

  function haloTarget(p, t) {
    var cx = L.heroX, cy = L.heroY;
    var rx = L.haloRx, ry = L.haloRy;
    var a = p.ang + t * p.spin;
    var sx = 1 + 0.035 * Math.sin(t * 1.4 + p.ph);
    var sy = 1 + 0.05 * Math.sin(t * 1.1 + p.ph * 1.7);
    if (p.spark) {
      var burst = 1 + (Math.sin(t * 0.7 + p.ph) * 0.5 + 0.5) * 0.16;
      sx *= burst; sy *= burst;
    }
    p.tx = cx + Math.cos(a) * rx * sx * p.rj;
    p.ty = cy + Math.sin(a) * ry * sy * p.rj + p.yj * ry;
    p.depth = clamp(0.5 + 0.5 * Math.sin(a), 0, 1);
  }

  function stepParticles(t) {
    for (var i = 0; i < N; i++) {
      var p = parts[i];
      if (kind === 'sphere') sphereTarget(p, t);
      else if (kind === 'halo') haloTarget(p, t);
      if (kind === 'a' || kind === 'b') p.depth = 1;

      var u = (t - p.goAt) / p.dur;
      if (u <= 0) {
        // still waiting for its cue: hover around where it was released
        p.x = p.fromX + Math.sin(t * 1.6 + p.ph) * 0.6;
        p.y = p.fromY + Math.cos(t * 1.3 + p.ph * 1.4) * 0.6;
        continue;
      }
      var e = u >= 1 ? 1 : easeOutBack(Math.max(0, u));
      p.x = p.fromX + (p.tx - p.fromX) * e;
      p.y = p.fromY + (p.ty - p.fromY) * e;
    }
  }

  /* ---------------- canvas sizing ---------------- */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    [fx, hudc].forEach(function (cv) {
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    });
    computeLayout();
    if (!parts.length) buildParticles();
    buildMotes();
    buildSamples();
    if (kind === 'a' || kind === 'b') morphTo(kind, 0);
  }

  /* ---------------- scene ---------------- */
  function drawScene(t, dim) {
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(4,6,11,0.42)';
    c.fillRect(0, 0, W, H);

    // The core light lives on the text column while the machine boots, then
    // moves behind the character for the finale.
    var cx = kind === 'halo' ? L.heroX : L.textX;
    var cy = kind === 'halo' ? L.heroY : L.textY;
    var glowI = 0;
    if (kind === 'sphere') glowI = 0.22 + 0.08 * Math.sin(t * 2);
    else if (kind === 'halo') glowI = 0.45 + 0.15 * Math.sin(t * 1.6);
    else if (kind === 'a' || kind === 'b') glowI = 0.16;

    if (glowI > 0) {
      c.globalCompositeOperation = 'lighter';
      var gr = c.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.42);
      gr.addColorStop(0, 'rgba(90,150,255,' + (0.2 * glowI) + ')');
      gr.addColorStop(0.35, 'rgba(70,110,240,' + (0.09 * glowI) + ')');
      gr.addColorStop(1, 'rgba(40,60,180,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, W, H);
    }

    c.globalCompositeOperation = 'lighter';
    var boost = (kind === 'halo' ? 1.15 : 1) * (dim == null ? 1 : dim);
    var twinkle = kind === 'halo' ? 1.6 : 3.2;
    for (var i = 0; i < N; i++) {
      var p = parts[i];
      var dp = p.depth;
      var tw = 0.78 + 0.22 * Math.sin(t * twinkle + p.ph);
      var da = kind === 'halo' ? (0.68 + 0.32 * dp)
        : kind === 'sphere' ? (0.18 + 0.82 * dp)
        : 1;
      var a = p.alpha * tw * da * boost;
      if (a <= 0.01) continue;
      var wx = Math.sin(t * 1.7 + p.ph) * 0.75;
      var wy = Math.cos(t * 1.35 + p.ph * 1.3) * 0.75;
      var px = p.x + wx, py = p.y + wy;
      var gs = p.size * (0.65 + 0.6 * dp) * 9;
      c.globalAlpha = a * 0.42;
      c.drawImage(sprites[p.tint], px - gs / 2, py - gs / 2, gs, gs);
      c.globalAlpha = a;
      c.fillStyle = coreColors[p.tint];
      var cw = p.cw * (0.65 + 0.5 * dp);
      c.fillRect(px - cw / 2, py - cw / 2, cw, cw);
    }
    c.globalAlpha = 1;

    if (kind === 'halo') {
      // slow motes drifting up around her
      for (var mi = 0; mi < motes.length; mi++) {
        var m = motes[mi];
        var my = ((m.y - t * m.sp) % H + H) % H;
        var mx = m.x + Math.sin(t * 0.55 + m.ph) * 16;
        var ms = m.r * 10;
        c.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 1.8 + m.ph));
        c.drawImage(sprites[0], mx - ms / 2, my - ms / 2, ms, ms);
      }
      c.globalAlpha = 1;

      var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      var rr = 30 + pulse * 9;
      var g3 = c.createRadialGradient(cx, cy, 0, cx, cy, rr * 4);
      g3.addColorStop(0, 'rgba(235,252,255,0.2)');
      g3.addColorStop(0.3, 'rgba(120,210,255,0.1)');
      g3.addColorStop(1, 'rgba(60,110,255,0)');
      c.fillStyle = g3;
      c.beginPath();
      c.arc(cx, cy, rr * 4, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }

  /* ---------------- hud ---------------- */
  var shockAt = -99;

  function drawHUD(t, visOverride) {
    h.clearRect(0, 0, W, H);
    var cx = L.heroX, cy = L.heroY;
    var base = Math.min(W, H);
    var R = L.ringR;
    var vis = visOverride == null ? clamp((t - 0.1) / 1.2, 0, 1) : visOverride;

    if (t < 1.0) {
      var k = clamp(t / 0.42, 0, 1);
      var wid = easeOut(k) * W * 0.86;
      h.save();
      h.globalAlpha = (1 - clamp((t - 0.4) / 0.6, 0, 1)) * 0.9;
      h.strokeStyle = 'rgba(200,245,255,0.95)';
      h.lineWidth = 1.5;
      h.shadowColor = '#5ee7ff';
      h.shadowBlur = 26;
      h.beginPath();
      h.moveTo(cx - wid / 2, cy);
      h.lineTo(cx + wid / 2, cy);
      h.stroke();
      h.restore();
    }

    h.save();
    h.globalAlpha = vis;

    h.strokeStyle = 'rgba(96,170,235,0.16)';
    h.lineWidth = 1;
    h.beginPath();
    h.arc(cx, cy, R, 0, TAU);
    h.stroke();

    h.save();
    h.translate(cx, cy);
    h.rotate(t * 0.08);
    h.setLineDash([1.5, 11]);
    h.strokeStyle = 'rgba(120,200,255,0.35)';
    h.beginPath();
    h.arc(0, 0, R * 1.16, 0, TAU);
    h.stroke();
    h.restore();

    for (var a = 0; a < 3; a++) {
      var dir = a % 2 === 0 ? 1 : -1;
      var off = t * (0.16 + a * 0.05) * dir;
      h.strokeStyle = a === 1 ? 'rgba(177,140,255,0.55)' : 'rgba(94,231,255,0.55)';
      h.lineWidth = 1.6;
      h.shadowColor = a === 1 ? 'rgba(177,140,255,0.9)' : 'rgba(94,231,255,0.9)';
      h.shadowBlur = 12;
      h.beginPath();
      h.arc(cx, cy, R * (0.9 + a * 0.035), off + a * 2.1, off + a * 2.1 + 0.62);
      h.stroke();
      h.shadowBlur = 0;
    }

    h.save();
    h.translate(cx, cy);
    for (var i = 0; i < 84; i++) {
      var ang = (i / 84) * TAU + t * 0.03;
      var major = i % 7 === 0;
      h.strokeStyle = major ? 'rgba(140,215,255,0.75)' : 'rgba(110,170,225,0.28)';
      h.lineWidth = major ? 1.4 : 0.8;
      h.beginPath();
      h.moveTo(Math.cos(ang) * R * 1.03, Math.sin(ang) * R * 1.03);
      h.lineTo(Math.cos(ang) * R * (major ? 1.075 : 1.048), Math.sin(ang) * R * (major ? 1.075 : 1.048));
      h.stroke();
    }
    h.restore();

    var br = R * 1.3;
    var len = br * 0.15;
    h.strokeStyle = 'rgba(94,231,255,0.3)';
    h.lineWidth = 1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var x = cx + s[0] * br, y = cy + s[1] * br;
      h.beginPath();
      h.moveTo(x, y - s[1] * len);
      h.lineTo(x, y);
      h.lineTo(x - s[0] * len, y);
      h.stroke();
    });

    var sw = t * 0.9;
    var grad = h.createLinearGradient(cx, cy, cx + Math.cos(sw) * R, cy + Math.sin(sw) * R);
    grad.addColorStop(0, 'rgba(94,231,255,0)');
    grad.addColorStop(1, 'rgba(94,231,255,0.35)');
    h.strokeStyle = grad;
    h.lineWidth = 1.2;
    h.beginPath();
    h.moveTo(cx, cy);
    h.lineTo(cx + Math.cos(sw) * R * 0.98, cy + Math.sin(sw) * R * 0.98);
    h.stroke();

    if (t > T.loadStart - 0.3 && kind !== 'halo') {
      var prog = progressAt(t);
      h.strokeStyle = 'rgba(94,231,255,0.85)';
      h.lineWidth = 2;
      h.shadowColor = '#5ee7ff';
      h.shadowBlur = 16;
      h.beginPath();
      h.arc(cx, cy, R * 1.22, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
      h.stroke();
      h.shadowBlur = 0;
      h.strokeStyle = 'rgba(120,180,240,0.12)';
      h.lineWidth = 1;
      h.beginPath();
      h.arc(cx, cy, R * 1.22, 0, TAU);
      h.stroke();
    }
    h.restore();

    if (kind === 'a' || kind === 'b' || kind === 'sphere') {
      var cycle = (t % 2.6) / 2.6;
      var sy = cy - R + cycle * 2 * R;
      h.save();
      h.globalAlpha = Math.sin(cycle * Math.PI) * 0.5;
      var g2 = h.createLinearGradient(cx - R, sy, cx + R, sy);
      g2.addColorStop(0, 'rgba(94,231,255,0)');
      g2.addColorStop(0.5, 'rgba(150,240,255,0.7)');
      g2.addColorStop(1, 'rgba(94,231,255,0)');
      h.strokeStyle = g2;
      h.lineWidth = 1.4;
      h.beginPath();
      h.moveTo(cx - R, sy);
      h.lineTo(cx + R, sy);
      h.stroke();
      h.restore();
    }

    if (shockAt > -50) {
      var age = t - shockAt;
      if (age > 0 && age < 1.6) {
        var rr2 = easeOut(age / 1.6) * base * 1.05;
        h.save();
        h.globalAlpha = (1 - age / 1.6) * 0.85;
        h.strokeStyle = 'rgba(200,248,255,0.85)';
        h.lineWidth = 2.2 * (1 - age / 1.6) + 0.5;
        h.beginPath();
        h.arc(cx, cy, rr2, 0, TAU);
        h.stroke();
        h.strokeStyle = 'rgba(120,215,255,0.5)';
        h.lineWidth = 1;
        h.beginPath();
        h.arc(cx, cy, rr2 * 1.012, 0, TAU);
        h.stroke();
        h.globalAlpha = (1 - age / 1.6) * 0.16;
        h.lineWidth = 16;
        h.beginPath();
        h.arc(cx, cy, rr2 * 0.9, 0, TAU);
        h.stroke();
        h.restore();
      }
    }
  }

  /* ---------------- progress / events ---------------- */
  function progressAt(t) {
    return easeInOut(clamp((t - T.loadStart) / (T.loadEnd - T.loadStart), 0, 1));
  }

  var lastPct = -1;
  var lastLabel = '';
  var chipShown = false;
  function syncChrome(t) {
    timeEl.textContent = t < 100 ? t.toFixed(2) : '99.99';
    if (CFG.sound !== 'off' && !sound.on && !soundAsked) {
      var showChip = t > 0.55 && t < T.ignite && !done;
      if (showChip !== chipShown) {
        chipShown = showChip;
        soundChip.classList.toggle('show', showChip);
      }
    } else if (chipShown) {
      chipShown = false;
      soundChip.classList.remove('show');
    }
    if (t > T.loadStart - 0.3 && kind !== 'halo') {
      var prog = progressAt(t);
      var pc = Math.floor(prog * 100);
      if (pc !== lastPct) {
        lastPct = pc;
        pctEl.innerHTML = pc + '<i>%</i>';
        barEl.style.width = pc + '%';
      }
      var label = prog < 0.45 ? 'LOADING CORE' : (prog < 0.82 ? 'SYNCING TENSORS' : 'FINALIZING');
      if (label !== lastLabel) {
        lastLabel = label;
        labelEl.textContent = label;
      }
      memEl.textContent = (2.4 + prog * 61.8).toFixed(1) + ' GB';
      sigEl.textContent = (60 + Math.floor(prog * 39)) + '%';
    }
  }

  function setPhase(txt) { phaseEl.textContent = txt; }

  function ignite(t) {
    shockAt = t;
    kind = 'halo';
    morphTo('halo', t);
    titleEl.classList.add('on');
    root.classList.add('hero-lit', 'hero-flash');
    setTimeout(function () { root.classList.remove('hero-flash'); }, 620);
    setPhase('ONLINE');
    root.classList.remove('loading');
    memEl.textContent = '64.2 GB';
    sigEl.textContent = '100%';
  }

  var ev = 0;
  function fireEvents(t) {
    if (ev === 0 && t >= 0.02) { ev = 1; setPhase('POWER ON'); }
    if (ev === 1 && t >= T.deepseek) { ev = 2; setPhase('IDENTITY MATRIX'); morphTo('a', T.deepseek); cue('identity', 0); }
    if (ev === 2 && t >= T.harness) {
      ev = 3;
      setPhase('HARNESS LINK');
      morphTo('b', T.harness);
      cue('harness', 0);
    }
    if (ev === 3 && t >= T.sphere) { ev = 4; setPhase('CORE ASSEMBLY'); morphTo('sphere', T.sphere); cue('sphere', 0); }
    if (ev === 4 && t >= T.loadStart - 0.3) {
      ev = 5;
      setPhase('NEURAL LOAD');
      root.classList.add('loading');
      cue('load', 0);
    }
    if (ev === 5 && t >= T.ignite) {
      ev = 6;
      ignite(T.ignite);
      cue('ignite', 0);
    }
  }


  /* ---------------- audio: a small cinematic score ----------------
   * Everything is synthesised at click time: a low bed, grain ticks while the
   * type assembles, a noise riser through the load, then one impact, a bell
   * and a pad. A generated impulse response gives the whole thing a room. */
  var sound = { ctx: null, master: null, wet: null, drone: null, noise: null, on: false, live: [] };
  var soundAsked = false;

  function audioContext() {
    if (sound.ctx) return sound.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      var ctx = new AC();
      var master = ctx.createGain();
      master.gain.value = 0;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      master.connect(comp);
      comp.connect(ctx.destination);

      // A small room: decaying noise as the impulse response.
      var len = Math.floor(ctx.sampleRate * 2.6);
      var ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch);
        for (var i = 0; i < len; i++) {
          var k = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 3.2) * (i < 220 ? i / 220 : 1);
        }
      }
      var conv = ctx.createConvolver();
      conv.buffer = ir;
      var wet = ctx.createGain();
      wet.gain.value = 0.34;
      wet.connect(conv);
      conv.connect(master);

      sound.ctx = ctx;
      sound.master = master;
      sound.wet = wet;
      sound.noise = (function () {
        var n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
        var ch2 = n.getChannelData(0);
        for (var j = 0; j < ch2.length; j++) ch2[j] = Math.random() * 2 - 1;
        return n;
      })();
    } catch (err) {
      sound.ctx = null;
    }
    return sound.ctx;
  }

  function panner(ctx, pan, dest) {
    if (!ctx.createStereoPanner) return dest;
    var p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  function voice(node) {
    sound.live.push(node);
    return node;
  }

  /** Deep power-on: sub drop, body thump, air, and a send into the room. */
  function hit(t, scale) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var g = scale == null ? 1 : scale;

    var sub = ctx.createOscillator();
    var sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(132, t);
    sub.frequency.exponentialRampToValueAtTime(33, t + 0.7);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.75 * g, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    sub.connect(sg);
    sg.connect(sound.master);
    sg.connect(panner(ctx, 0, sound.wet));
    sub.start(t);
    sub.stop(t + 1.35);

    var body = ctx.createBufferSource();
    body.buffer = sound.noise;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    var bg = ctx.createGain();
    bg.gain.setValueAtTime(0.4 * g, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    body.connect(lp);
    lp.connect(bg);
    bg.connect(sound.master);
    bg.connect(sound.wet);
    body.start(t);
    body.stop(t + 0.5);

    var air = ctx.createBufferSource();
    air.buffer = sound.noise;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    var ag = ctx.createGain();
    ag.gain.setValueAtTime(0.16 * g, t);
    ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    air.connect(hp);
    hp.connect(ag);
    ag.connect(sound.master);
    air.start(t);
    air.stop(t + 0.2);
  }

  /** Short pitched grain, panned: the particles clicking into place. */
  function grain(t, freq, pan, vol) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g);
    g.connect(panner(ctx, pan, sound.master));
    g.connect(panner(ctx, pan * 0.7, sound.wet));
    o.start(t);
    o.stop(t + 0.13);
    voice(o);
  }

  /** A burst of grains, scattered in pitch and stereo. */
  function cascade(t, count, span, base) {
    for (var i = 0; i < count; i++) {
      var q = i / Math.max(1, count - 1);
      grain(t + q * span, (base || 1100) * (0.7 + Math.random() * 1.1), (Math.random() * 2 - 1) * 0.75, 0.028 + Math.random() * 0.022);
    }
  }

  /** Filtered-noise whoosh, travelling left to right. */
  function whoosh(t, dur, f0, f1) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var src = ctx.createBufferSource();
    src.buffer = sound.noise;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(sound.master);
    g.connect(panner(ctx, 0.5, sound.wet));
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Rising tension through the load: filtered noise plus a climbing tone. */
  function riser(t, dur) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var src = ctx.createBufferSource();
    src.buffer = sound.noise;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(220, t);
    hp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(sound.master);
    src.start(t);
    src.stop(t + dur + 0.05);

    var o = ctx.createOscillator();
    var og = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(520, t + dur);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.022, t + dur * 0.9);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + dur);
    o.connect(lp);
    lp.connect(og);
    og.connect(sound.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** FM bell for the moment the core comes online. */
  function bell(t, freq, vol) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var carrier = ctx.createOscillator();
    var mod = ctx.createOscillator();
    var modGain = ctx.createGain();
    var g = ctx.createGain();
    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.value = freq;
    mod.frequency.value = freq * 1.51;
    modGain.gain.setValueAtTime(freq * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(g);
    g.connect(sound.master);
    g.connect(panner(ctx, 0.15, sound.wet));
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + 2.7);
    mod.stop(t + 2.7);
  }

  /** Warm pad that lingers after ignition. */
  function pad(t, dur, freqs) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(700, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(sound.master);
    g.connect(sound.wet);
    freqs.forEach(function (f, idx) {
      [-5, 5].forEach(function (cents) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents + (idx % 2 ? 2 : -2);
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      });
    });
  }

  /** The low bed that runs under the whole sequence. */
  function bed(t, dur) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on || sound.drone) return;
    var bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.linearRampToValueAtTime(0.9, t + 2.2);
    bus.gain.linearRampToValueAtTime(0.75, t + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(700, t + dur * 0.8);
    lp.Q.value = 2.2;
    bus.connect(lp);
    lp.connect(sound.master);
    [55, 82.41, 110].forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      var g = ctx.createGain();
      g.gain.value = 0.34 / (i + 1);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + i * 0.021;
      var lg = ctx.createGain();
      lg.gain.value = 2.4 + i;
      lfo.connect(lg);
      lg.connect(o.detune);
      lfo.start(t);
    });
    sound.drone = bus;
  }

  /**
   * Turn sound on. A manual call always wins (it carries the gesture);
   * an automatic one only proceeds when the engine is already running.
   */
  function enableSound(manual) {
    if (sound.on) return;
    var ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (err) { /* stays suspended */ }
    }
    if (!manual && ctx.state !== 'running') return;

    sound.on = true;
    soundAsked = true;
    var t0 = ctx.currentTime + 0.03;
    sound.master.gain.cancelScheduledValues(t0);
    sound.master.gain.setValueAtTime(0.0001, t0);
    sound.master.gain.linearRampToValueAtTime(0.46, t0 + 1.1);

    bed(t0, (T.done - T.ignite) + 6.5);
    hit(t0, 1);
    soundChip.classList.add('live');
    soundChip.innerHTML = '<b></b>SOUND ON';
    setTimeout(function () {
      soundChip.classList.remove('live', 'show');
    }, 2200);
  }

  /** Cue one phase of the score. Times are relative to the sequence clock. */
  function cue(name, t) {
    var ctx = sound.ctx;
    if (!ctx || !sound.on) return;
    var at = ctx.currentTime + Math.max(0, t);
    if (name === 'identity') {
      cascade(at, 9, 0.5, 1250);
    } else if (name === 'harness') {
      cascade(at, 11, 0.55, 980);
      whoosh(at, 0.7, 420, 1800);
    } else if (name === 'sphere') {
      whoosh(at, 1.1, 260, 3200);
      grain(at + 0.15, 640, 0, 0.05);
    } else if (name === 'load') {
      riser(at, (T.loadEnd - T.loadStart) * 0.92);
      for (var i = 0; i < 9; i++) {
        grain(at + i * 0.17, 1800 + i * 90, -0.5 + i * 0.12, 0.018);
      }
    } else if (name === 'ignite') {
      hit(at, 1.15);
      bell(at + 0.02, 1320, 0.1);
      bell(at + 0.26, 1760, 0.06);
      pad(at + 0.05, 4.2, [220, 277.18, 329.63, 440]);
    }
  }

  function fadeOutSound() {
    var ctx = sound.ctx;
    if (!ctx || !sound.master) return;
    var t0 = ctx.currentTime;
    var g = sound.master.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(Math.max(0.0001, g.value), t0);
    g.linearRampToValueAtTime(0.0001, t0 + 0.9);
  }

  /* ---------------- lifecycle ---------------- */
  var begun = false;
  var startedAt = 0;
  var done = false;
  var appReady = false;
  var frozen = false;
  var rafId = 0;
  var lastDraw = 0;
  var mo = null;
  var waitingForShell = false;

  function detectReady() {
    if (appReady) return;
    var r = document.getElementById('root');
    if (r && r.childElementCount > 0) appReady = true;
  }

  try {
    mo = new MutationObserver(detectReady);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (err) { /* no MutationObserver */ }

  function finish() {
    if (done) return;
    done = true;
    fadeOutSound();
    root.classList.add('done');
    try { window.__DSH_BOOT_SCREEN_DONE__ = true; } catch (err) {}
    try {
      window.dispatchEvent(new CustomEvent('dsh-boot-screen:done'));
    } catch (err) {}
    setTimeout(cleanup, 780);
  }

  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (mo) { mo.disconnect(); mo = null; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', skip);
    window.removeEventListener('pointerdown', onAnyGesture);
    window.removeEventListener('keydown', onAnyGesture);
    if (root.parentNode) root.parentNode.removeChild(root);
    if (sound.ctx) {
      var ctx = sound.ctx;
      setTimeout(function () { try { ctx.close(); } catch (err) { /* already closed */ } }, 200);
    }
  }

  var rzTimer = 0;
  function onResize() {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(resize, 140);
  }
  window.addEventListener('resize', onResize);

  /**
   * Start the sequence. Called by the start button, by any pointer/key press
   * while idle, or automatically when `autostart` is on. The gesture also
   * unlocks audio, so the power-on hit plays from the very first frame.
   */
  function begin() {
    if (begun || done) return;
    begun = true;
    startedAt = now();
    root.classList.add('started');
    if (CFG.sound !== 'off') enableSound(true);
    setPhase('POWER ON');
  }

  function skip(e) {
    if (done || frozen || !begun) return;
    if (e && (e.type !== 'keydown' || e.key !== 'Escape')) return;
    var target = T.ignite + 0.05;
    if ((now() - startedAt) / 1000 < target) startedAt = now() - target * 1000;
  }

  function onAnyGesture(e) {
    if (begun) return;
    // The sound chip has its own handler; ignore it here.
    if (e.target && e.target.closest && e.target.closest('.dshb-sound')) return;
    begin();
  }
  window.addEventListener('pointerdown', onAnyGesture);
  window.addEventListener('keydown', onAnyGesture);

  // Only a deliberate Escape skips a running sequence.
  if (CFG.skippable !== false) window.addEventListener('keydown', skip);

  /* test hook: freeze an exact frame (used by tools/preview.html) */
  var TEST = window.__DSH_BOOT_SCREEN_TEST__;

  function drawIdle() {
    var t = now() / 1000;
    for (var i = 0; i < N; i++) {
      var p = parts[i];
      p.x = p.fromX + Math.sin(t * 0.55 + p.ph) * 7;
      p.y = p.fromY + Math.cos(t * 0.47 + p.ph * 1.3) * 7;
    }
    drawScene(t, 0.3);
    drawHUD(t, 0.26);
  }

  function frame() {
    rafId = requestAnimationFrame(frame);
    if (!begun) {
      drawIdle();
      return;
    }
    var t = (now() - startedAt) / 1000;
    if (frozen) t = TEST.at;

    fireEvents(t);

    // Positions are a pure function of wall-clock time, so a slow frame can
    // never leave the swarm behind: it simply skips intermediate poses.
    stepParticles(t);


    drawScene(t);
    drawHUD(t);
    syncChrome(t);

    if (!frozen && t >= T.done) {
      detectReady();
      if (!appReady && !waitingForShell && t > T.done + 1.2) {
        waitingForShell = true;
        setPhase('LINKING SHELL');
      }
      if (appReady || t >= T.holdMax) finish();
    }
    if (TEST) root.dataset.state = (appReady ? 'R' : '-') + (done ? 'D' : '-') + '|' + t.toFixed(1) + '|' + kind + '|' + ev;
  }

  /* ---------------- boot ---------------- */
  var grainUrl = (function () {
    try {
      var s = 180;
      var cv = document.createElement('canvas');
      cv.width = cv.height = s;
      var g = cv.getContext('2d');
      var img = g.createImageData(s, s);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 26;
      }
      g.putImageData(img, 0, 0);
      return 'url(' + cv.toDataURL() + ')';
    } catch (err) { return ''; }
  })();
  if (grainUrl) root.querySelector('.dshb-grain').style.backgroundImage = grainUrl;

  resize();

  // Tell the host this browser really ran the screen (diagnostics only).
  try {
    if (navigator.sendBeacon) navigator.sendBeacon('/dsh-boot-screen/seen');
    else fetch('/dsh-boot-screen/seen', { method: 'POST', keepalive: true }).catch(function () {});
  } catch (err) { /* offline or blocked */ }
  lastDraw = now();

  if (TEST && typeof TEST.at === 'number') {
    begun = true;
    root.classList.add('started');
    startedAt = now() - TEST.at * 1000;
    frozen = !!TEST.freeze;
    if (frozen) {
      // settle the swarm so a still frame shows the intended shape
      fireEvents(TEST.at);
      for (var wi = 0; wi < 160; wi++) stepParticles(TEST.at);
    }
  }

  if (CFG.sound === 'auto') enableSound(false);

  if (CFG.autostart) begin();

  rafId = requestAnimationFrame(frame);
})();
