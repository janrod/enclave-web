// The burning E. A laser traces the logo's E, throwing sparks, then switches
// off and rests; the line it engraves fades a little every frame, so the E
// only ever exists as that cooling trail. WebGL blurs the mask into three glows and maps the heat through
// a black-and-white burn ramp (the thermal-type pipeline from the hackathon
// invite, without the colour).
(() => {
  const hero = document.querySelector(".hero");
  const canvas = document.getElementById("ember");
  if (!hero || !canvas) return;

  // The E from the wordmark, traced from the logo PNG (px, 147 tall) and
  // squared up. Clockwise from the top-left corner; the font's italic shear is
  // already in the coordinates.
  const E_PTS = [
    [12.86, 0], [182.26, 0], [180.95, 15], [64.05, 15], [60.03, 61], [104.23, 61],
    [102.87, 76.5], [58.67, 76.5], [53.81, 132], [170.91, 132], [169.6, 147], [0, 147],
  ];
  const E_W = 182.26, E_H = 147;

  const SIZE = 0.42;   // the E's height, as a share of the hero's height
  const TRACE = 4;     // seconds for the dot to trace the E once
  const REST = 0.5;    // seconds the laser is off before the next trace
  const SPARKS = 70;   // sparks per second while cutting
  const TRAIL = 2.6;   // seconds for the burn trail to fade to 1/e
  const FADE_STEP = 1 / 30;  // the fade runs at a fixed rate, see fade()

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return;

  // ---------- Shaders ----------

  const vert = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // 13-tap Gaussian along one axis. Rendering into a smaller target also downsamples.
  const blurFrag = `
    precision mediump float;
    uniform sampler2D uSrc;
    uniform vec2 uStep;
    uniform float uGain;
    varying vec2 vUv;
    void main() {
      vec4 sum = vec4(0.0);
      float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float w = exp(-float(i * i) / 18.0);
        sum += texture2D(uSrc, vUv + uStep * float(i)) * w;
        wsum += w;
      }
      gl_FragColor = sum / wsum * uGain;
    }`;

  const burnFrag = `
    precision highp float;
    uniform sampler2D uMask;  // outline and dot, sharp
    uniform sampler2D uSoft;  // light blur
    uniform sampler2D uMid;   // mid glow
    uniform sampler2D uWide;  // wide glow
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uPointerHeat;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      float aspect = uRes.x / uRes.y;
      vec2 p = vec2(uv.x * aspect, uv.y);
      float t = uTime;

      // The halo is sampled through drifting noise so it wobbles like heat
      // haze instead of sitting as a clean blur.
      vec2 warp = vec2(fbm(p * 2.2 + vec2(t * 0.13, 0.0)), fbm(p * 2.2 + vec2(5.2, -t * 0.11))) - 0.5;
      float m = texture2D(uMask, uv).r;
      float a = texture2D(uSoft, uv + warp * 0.006).r;
      float b = texture2D(uMid, uv + warp * 0.03).r;
      float c = texture2D(uWide, uv + warp * 0.07).r;
      c *= 0.7 + 0.6 * fbm(p * 1.6 + vec2(-t * 0.3, t * 0.2));
      float heat = m * 0.9 + a * 1.4 + b * 1.6 + c * 2.5;

      // Smoulder: hot and cold patches drifting through the glow.
      heat += 0.7 * smoothstep(0.45, 0.85, fbm(p * 3.0 + vec2(t * 0.07, -t * 0.05))) * c;
      heat -= 0.4 * smoothstep(0.55, 0.9, fbm(p * 6.0 - t * 0.12)) * b;

      heat *= 0.94 + 0.06 * sin(t * 0.7 + p.y * 2.0);              // breathing

      // The pointer is a faint torch.
      vec2 d = vec2((uv.x - uPointer.x) * aspect, uv.y - uPointer.y);
      heat += exp(-dot(d, d) / 0.02) * uPointerHeat * 0.12;

      // Sensor grain, strongest where it burns hottest.
      float g = hash(gl_FragCoord.xy + floor(t * 24.0) * 17.0);
      heat += (g - 0.5) * (0.015 + 0.18 * smoothstep(0.3, 1.0, heat));

      // Black to white, eased so a cooling trail runs through the greys
      // before it goes white. Output is premultiplied white, so the page
      // background shows through.
      float v = pow(smoothstep(0.02, 1.15, heat), 0.95);
      // The canvas runs past the hero behind the text; fade out before its edges.
      v *= smoothstep(0.0, 0.18, uv.y) * smoothstep(0.0, 0.18, 1.0 - uv.y)
         * smoothstep(0.0, 0.08, uv.x) * smoothstep(0.0, 0.08, 1.0 - uv.x);
      gl_FragColor = vec4(v, v, v, v);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function program(fragSrc, uniforms) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const u = {};
    uniforms.forEach(name => { u[name] = gl.getUniformLocation(prog, name); });
    return { prog, u };
  }

  let blur, burn;
  try {
    blur = program(blurFrag, ["uSrc", "uStep", "uGain"]);
    burn = program(burnFrag, ["uMask", "uSoft", "uMid", "uWide", "uRes", "uTime", "uPointer", "uPointerHeat"]);
  } catch (err) {
    console.warn(err);
    return;
  }
  gl.useProgram(burn.prog);
  ["uMask", "uSoft", "uMid", "uWide"].forEach((name, i) => gl.uniform1i(burn.u[name], i));

  // One big triangle covering the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function makeTexture() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function makeTarget(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const tex = makeTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  function freeTarget(t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }

  const maskTex = makeTexture();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // ---------- The E, in mask pixels ----------

  // Two layers. `trail` holds the engraved line and fades every frame; `mask`
  // is what goes to the GPU: the trail plus the laser's head, glare and
  // sparks, redrawn from scratch each frame so none of them persist.
  const trail = document.createElement("canvas");
  const tc = trail.getContext("2d");
  const mask = document.createElement("canvas");
  const m = mask.getContext("2d");
  let geo = null;  // { pts, cum, per, eh, lw }

  function layoutE(heroH) {
    const w = mask.width, h = mask.height;
    const eh = Math.min(heroH * SIZE, w * 0.5 * E_H / E_W);
    const k = eh / E_H;
    const ox = (w - E_W * k) / 2, oy = (h - E_H * k) / 2;
    const pts = E_PTS.map(([x, y]) => [ox + x * k, oy + y * k]);
    pts.push(pts[0]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    geo = { pts, cum, per: cum[cum.length - 1], eh, lw: Math.max(1, eh * 0.007) };
  }

  // Point at arc length s along the outline (wraps).
  function pointAt(s) {
    const { pts, cum, per } = geo;
    s = ((s % per) + per) % per;
    let i = 1;
    while (cum[i] < s) i++;
    const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  }

  // Path along the outline from s0 forward to s1, turning the corners.
  function pathAlong(ctx, s0, s1) {
    const { pts, cum, per } = geo;
    ctx.beginPath();
    ctx.moveTo(...pointAt(s0));
    for (let lap = Math.floor(s0 / per) * per; lap < s1; lap += per) {
      for (let i = 1; i < pts.length; i++) {
        const s = lap + cum[i];
        if (s > s0 && s < s1) ctx.lineTo(pts[i][0], pts[i][1]);
      }
    }
    ctx.lineTo(...pointAt(s1));
  }

  function clearTrail() {
    tc.globalCompositeOperation = "source-over";
    tc.fillStyle = "#000";
    tc.fillRect(0, 0, trail.width, trail.height);
  }

  // Exponential fade towards black. 8-bit values stall once a step would move
  // them by less than half a level, which would leave a ghost of every lap, so
  // each step also takes one level off everything (difference with 1/255).
  let fadeDebt = 0;
  function fade(dt) {
    fadeDebt += dt;
    if (fadeDebt < FADE_STEP) return;
    const steps = Math.min(8, Math.floor(fadeDebt / FADE_STEP));
    fadeDebt -= steps * FADE_STEP;
    tc.globalCompositeOperation = "source-over";
    tc.fillStyle = `rgba(0,0,0,${1 - Math.exp(-steps * FADE_STEP / TRAIL)})`;
    tc.fillRect(0, 0, trail.width, trail.height);
    tc.globalCompositeOperation = "difference";
    tc.fillStyle = "rgb(1,1,1)";
    for (let i = 0; i < steps; i++) tc.fillRect(0, 0, trail.width, trail.height);
  }

  // Engrave the stretch of outline the laser crossed since the last frame.
  function engrave(s0, s1, v = 235) {
    tc.globalCompositeOperation = "lighten";
    tc.lineCap = "round";
    tc.lineJoin = "round";
    tc.lineWidth = geo.lw * 1.5;
    tc.strokeStyle = `rgb(${v},${v},${v})`;
    pathAlong(tc, s0, s1);
    tc.stroke();
  }

  // Sparks thrown off the cut: a little upward kick, then gravity.
  let sparks = [];
  function updateSparks(dt, x, y, power) {
    const eh = geo.eh;
    let n = power > 0.5 ? dt * SPARKS * (0.5 + Math.random()) : 0;
    while (n-- > Math.random()) {
      const a = Math.random() * 2 * Math.PI, sp = eh * (0.3 + Math.random() * 1.3);
      const life = 0.15 + Math.random() * 0.4;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - eh * 0.6, life, age: 0 });
    }
    for (const p of sparks) {
      p.px = p.x; p.py = p.y;
      p.vy += eh * 3.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
    }
    sparks = sparks.filter(p => p.age < p.life);
  }

  // The frame that goes to the GPU: the trail, then the live laser on top.
  function compose(x, y, power) {
    const lw = geo.lw;
    m.globalCompositeOperation = "source-over";
    m.drawImage(trail, 0, 0);
    m.globalCompositeOperation = "lighten";

    m.lineCap = "round";
    for (const p of sparks) {
      const v = Math.round(255 * Math.pow(1 - p.age / p.life, 1.5));
      m.strokeStyle = `rgb(${v},${v},${v})`;
      m.lineWidth = lw * 0.8;
      m.beginPath();
      m.moveTo(p.px, p.py);
      m.lineTo(p.x, p.y);
      m.stroke();
    }

    if (power <= 0) return;
    const f = power * (0.85 + 0.15 * Math.random());  // the laser flickers
    // Glare: a short cross streak through the head.
    const streak = (dx, dy, len, thick, peak) => {
      const g = m.createLinearGradient(x - dx * len, y - dy * len, x + dx * len, y + dy * len);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${peak * f})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      m.strokeStyle = g;
      m.lineWidth = thick;
      m.beginPath();
      m.moveTo(x - dx * len, y - dy * len);
      m.lineTo(x + dx * len, y + dy * len);
      m.stroke();
    };
    streak(1, 0, lw * 30 * f, lw * 1.1, 0.8);
    streak(0, 1, lw * 12 * f, lw * 0.9, 0.55);
    // Head: small and white-hot; the blur passes turn it into the bloom.
    const r = lw * 5 * (0.9 + 0.2 * Math.random());
    const g = m.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${f})`);
    g.addColorStop(0.45, `rgba(255,255,255,${0.85 * f})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    m.fillStyle = g;
    m.beginPath();
    m.arc(x, y, r, 0, 2 * Math.PI);
    m.fill();
  }

  // A still frame's trail, drawn in one go: segments brightening towards the head.
  function drawStill(s) {
    const len = geo.per * 0.6, n = 48;
    clearTrail();
    for (let i = 0; i < n; i++) {
      engrave(s - len * (n - i) / n, s - len * (n - i - 1) / n, Math.round(235 * Math.exp(-(n - i) / n * 2.5)));
    }
    sparks = [];
    compose(...pointAt(s), 1);
  }

  // ---------- Frame ----------

  let levels = null;
  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.75;
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (w === canvas.width && h === canvas.height && geo) return false;
    canvas.width = mask.width = trail.width = w;
    canvas.height = mask.height = trail.height = h;
    layoutE(hero.clientHeight * scale);
    clearTrail();

    // Three glow levels, each blurred from the one before at a lower resolution.
    if (levels) levels.forEach(l => { freeTarget(l.tmp); freeTarget(l.out); });
    // The wide halo is faint after that much blur, so it's stored amplified
    // (gain) to keep its falloff smooth in 8 bits; the burn pass weighs it to suit.
    levels = [[2, 0.018, 1], [4, 0.11, 1], [8, 0.5, 8]].map(([div, sigma, gain]) => ({
      tmp: makeTarget(w / div, h / div),
      out: makeTarget(w / div, h / div),
      sigma: geo.eh * sigma,
      gain,
    }));
    return true;
  }

  function blurPass(srcTex, dst, dx, dy, sigma, gain) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    // sigma is in mask pixels; the shader's kernel spans three taps per sigma.
    gl.uniform2f(blur.u.uStep, dx * sigma / 3 / mask.width, dy * sigma / 3 / mask.height);
    gl.uniform1f(blur.u.uGain, gain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function render(t, pointerUv, push) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);

    gl.useProgram(blur.prog);
    gl.uniform1i(blur.u.uSrc, 0);
    let src = maskTex;
    for (const l of levels) {
      blurPass(src, l.tmp, 1, 0, l.sigma, 1);
      blurPass(l.tmp.tex, l.out, 0, 1, l.sigma, l.gain);
      src = l.out.tex;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(burn.prog);
    [maskTex, ...levels.map(l => l.out.tex)].forEach((tex, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    });
    gl.uniform2f(burn.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(burn.u.uTime, t);
    gl.uniform2f(burn.u.uPointer, pointerUv[0], pointerUv[1]);
    gl.uniform1f(burn.u.uPointerHeat, push);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Pointer over the hero, eased.
  let target = [0.5, 0.5], pointer = [0.5, 0.5], pointerHeat = 0, lastMove = -1e9;
  hero.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    target = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    lastMove = performance.now();
  }, { passive: true });

  // Each cycle the laser traces the E once from the top-left corner, easing
  // in and out (sine), then switches off and rests. Arc length accumulates over
  // laps so it only ever grows, which keeps pathAlong() simple. Power is the
  // laser's on/off, with a short fade either side.
  function traceAt(t) {
    const cycle = TRACE + REST;
    const n = Math.floor(t / cycle);
    const local = t - n * cycle;
    const k = Math.min(1, local / TRACE);
    const eased = k - Math.sin(2 * Math.PI * k) / (2 * Math.PI);
    const power = Math.min(1, local / 0.06, Math.max(0, (TRACE + 0.08 - local) / 0.08));
    return { s: (n + eased) * geo.per, power };
  }

  let start = performance.now(), last = start, sLast = 0;

  function step(now) {
    const t = (now - start) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const { s, power } = traceAt(t);
    fade(dt);
    // After a pause (tab hidden, hero scrolled away) don't engrave the whole gap.
    if (power > 0 && s > sLast && s - sLast < geo.per * 0.1) engrave(sLast, s);
    sLast = s;
    const [x, y] = pointAt(s);
    updateSparks(dt, x, y, power);
    compose(x, y, power);

    pointer[0] += (target[0] - pointer[0]) * 0.08;
    pointer[1] += (target[1] - pointer[1]) * 0.08;
    pointerHeat += ((now - lastMove < 1200 ? 1 : 0) - pointerHeat) * 0.04;
    render(t, pointer, pointerHeat);
  }

  function renderStill() {
    drawStill(geo.per * 0.7);
    render(0, [0.5, 0.5], 0);
  }

  // Only animate while the hero is on screen.
  let visible = true, running = false;
  function loop(now) {
    if (!visible) { running = false; return; }
    step(now);
    requestAnimationFrame(loop);
  }
  function run() {
    if (running || reduceMotion) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) run(); }).observe(hero);
  }

  let resizeTimer;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (resize()) { sLast = 0; if (reduceMotion) renderStill(); }
    }, 150);
  });

  document.documentElement.classList.add("has-ember");
  resize();
  if (reduceMotion) renderStill(); else run();
})();
