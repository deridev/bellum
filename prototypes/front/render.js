/*
 * Bellum front prototype: WebGL2 map renderer.
 *
 * The simulation field is coarse (≈4.4 km cells). The renderer samples it
 * with bicubic filtering and adds zoom-aware noise, then draws the front as
 * the zero contour of that smooth field. That's why the border reads like a
 * continuous painting at any zoom instead of a grid of provinces.
 */
(function (root) {
  'use strict';
  const S = root.BellumSim;
  const { proj, CELL, GW, GH, GX0, GY0, N } = S;

  // Land texture box (world units)
  const LB = (() => { const a = proj(117, 45), b = proj(136, 30.5); return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] }; })();
  const LTW = 2048, LTH = Math.round(LTW * LB.h / LB.w);

  const VS = `#version 300 es
  in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // ---------- height bake (ports BellumSim.heightAt to the GPU) ----------
  const BAKE_FS = `#version 300 es
  precision highp float; precision highp int;
  uniform vec4 uBox; uniform vec2 uSize;
  uniform vec4 uRA[8]; uniform vec2 uRB[8];
  out vec4 o;
  float hashI(int i, int j){ uint h = uint(i) * 374761393u + uint(j) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; return float(h ^ (h >> 16u)) / 4294967295.0; }
  float vnoise(vec2 p){ vec2 fl = floor(p); int i = int(fl.x), j = int(fl.y); vec2 f = p - fl; vec2 u = f*f*(3.0-2.0*f);
    float a = hashI(i,j), b = hashI(i+1,j), c = hashI(i,j+1), d = hashI(i+1,j+1);
    return a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y; }
  float fbm(vec2 p){ float s=0.0,a=0.5,f=1.0; for(int k=0;k<4;k++){ s+=a*vnoise(p*f); f*=2.03; a*=0.5; } return s; }
  float ridged(vec2 p){ float s=0.0,a=0.5,f=1.0; for(int k=0;k<5;k++){ float n = 1.0-abs(vnoise(vec2(p.x*f+17.3*float(k), p.y*f))*2.0-1.0); s+=a*n*n; f*=2.1; a*=0.5; } return s; }
  float segDist(vec2 p, vec2 a, vec2 b){ vec2 d=b-a; float t=clamp(dot(p-a,d)/dot(d,d),0.0,1.0); return length(a+t*d-p); }
  void main(){
    vec2 uv = gl_FragCoord.xy / uSize; vec2 p = uBox.xy + uv * uBox.zw; // FB row 0 = texture row 0 = north
    float m = 0.0;
    for (int r=0;r<8;r++){ float d = segDist(p, uRA[r].xy, uRA[r].zw)/uRB[r].x; m = max(m, uRB[r].y*exp(-d*d)); }
    float base = 0.10 + 0.22*fbm(p*2.6);
    float rid = ridged(vec2(p.x*4.3+3.1, p.y*4.3));
    o = vec4(min(1.0, base*0.7 + m*(0.35+0.85*rid)), 0.0, 0.0, 1.0);
  }`;

  // ---------- main map shader ----------
  const MAP_FS = `#version 300 es
  precision highp float;
  uniform vec2 uRes, uCenter; uniform float uUpp, uDpr, uMix, uTime, uDmzOn, uGrid;
  uniform vec4 uLandBox, uGridBox; uniform vec2 uGridSize, uLandSize;
  uniform sampler2D tLand, tHeight, tF0, tF1, tF2, tF3, tPocket, tDmz, tX1, tX2;
  uniform vec3 uNorth, uSouth;
  out vec4 o;

  // integer hash: stays clean at any zoom (float hashes streak at large coordinates)
  float hi(ivec2 q){ uvec2 v = uvec2(q); uint h = v.x * 374761393u + v.y * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; return float(h ^ (h >> 16u)) * (1.0/4294967295.0); }
  float vn(vec2 p){ vec2 fl = floor(p); ivec2 i = ivec2(fl); vec2 f = p - fl; vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hi(i),hi(i+ivec2(1,0)),u.x), mix(hi(i+ivec2(0,1)),hi(i+ivec2(1,1)),u.x), u.y); }

  // B-spline bicubic from 4 bilinear taps
  vec4 cubicW(float v){ vec4 n = vec4(1.0,2.0,3.0,4.0) - v; vec4 s = n*n*n;
    float x = s.x, y = s.y-4.0*s.x, z = s.z-4.0*s.y+6.0*s.x; return vec4(x, y, z, 6.0-x-y-z) * (1.0/6.0); }
  vec4 bicubic(sampler2D t, vec2 uv, vec2 size){
    vec2 inv = 1.0/size; uv = uv*size - 0.5; vec2 fxy = fract(uv); uv -= fxy;
    vec4 xc = cubicW(fxy.x), yc = cubicW(fxy.y);
    vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
    vec4 s = vec4(xc.xz+xc.yw, yc.xz+yc.yw);
    vec4 off = (c + vec4(xc.yw, yc.yw)/s) * inv.xxyy;
    vec4 s0 = texture(t, off.xz), s1 = texture(t, off.yz), s2 = texture(t, off.xw), s3 = texture(t, off.yw);
    float sx = s.x/(s.x+s.y), sy = s.z/(s.z+s.w);
    return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
  }
  // Multi-scale domain warp: the field is sampled at a jittered position, so the
  // front gets organic, fractal detail. Octaves smaller than a few pixels fade out,
  // so new detail appears as you zoom in and nothing shimmers.
  vec2 warp(vec2 p){
    vec2 w = vec2(0.0); float a = 0.05, f = 6.0;
    for (int k=0;k<8;k++){ float fade = smoothstep(uUpp*3.0, uUpp*10.0, 1.0/f);
      w += (vec2(vn(p*f + vec2(3.1*float(k), 1.7)), vn(p*f + vec2(9.2, 5.3*float(k)))) - 0.5) * a * fade;
      f *= 2.15; a *= 0.58; }
    return w;
  }
  float edgeNoise(vec2 p){ return 0.0; }
  // a living edge: where fighting is heavy the front boils slightly
  vec2 warpLive(vec2 p, float heat){
    vec2 w = vec2(0.0); float a = 0.012, f = 22.0, t = uTime;
    for (int k=0;k<3;k++){ float fade = smoothstep(uUpp*3.0, uUpp*10.0, 1.0/f); float sp = 0.7*float(k+1);
      w += (vec2(vn(p*f + vec2(t*sp, 3.0)), vn(p*f + vec2(7.0, -t*sp))) - 0.5) * a * fade; f *= 2.4; a *= 0.5; }
    return w*heat;
  }
  // Catmull-Rom through four daily snapshots: smooth motion with no speed jerks between days
  float cr4(float p0, float p1, float p2, float p3, float t){
    return 0.5*((2.0*p1) + (-p0+p2)*t + (2.0*p0-5.0*p1+4.0*p2-p3)*t*t + (-p0+3.0*p1-3.0*p2+p3)*t*t*t); }
  float aaStep(float v){ float w = max(fwidth(v), 1e-5); return smoothstep(-w, w, v); }

  void main(){
    vec2 fc = gl_FragCoord.xy;
    vec2 p = uCenter + vec2(fc.x - uRes.x*0.5, uRes.y*0.5 - fc.y) * uUpp;
    vec2 luv = (p - uLandBox.xy) / uLandBox.zw;
    vec4 L = bicubic(tLand, luv, uLandSize);
    float coast = (vn(p*60.0)-0.5)*0.12*smoothstep(uUpp*2.0, uUpp*8.0, 1.0/60.0);
    float land = aaStep(L.r - 0.5 + coast);
    float korea = aaStep(L.g - 0.5 + coast) * land;
    float china = aaStep(L.b - 0.5) * land;
    float japan = aaStep(L.a - 0.5) * land;

    // ---- terrain ----
    vec2 e = vec2(1.5/uLandSize.x, 0.0), e2 = vec2(0.0, 1.5/uLandSize.y);
    float tw = 3.0*uLandBox.z/uLandSize.x;
    float h = texture(tHeight, luv).r;
    float hx = (texture(tHeight, luv+e).r - texture(tHeight, luv-e).r) / tw;
    float hy = (texture(tHeight, luv-e2).r - texture(tHeight, luv+e2).r) / tw;
    // fractal ground detail; fades in as you zoom so it never turns into a mosaic
    float det = 0.0, a = 0.5, f = 28.0;
    for (int k=0;k<7;k++){ float fade = smoothstep(uUpp*2.5, uUpp*9.0, 1.0/f); det += (vn(p*f + float(k)*13.7)-0.5)*a*fade; f *= 2.3; a *= 0.56; }
    vec2 dd = vec2(dFdx(det), -dFdy(det)) / uUpp;
    float rough = 0.25 + 1.2*h;
    vec3 nrm = normalize(vec3(-(hx*0.30 + dd.x*0.010*rough), -(hy*0.30 + dd.y*0.010*rough), 1.0));
    float sun = clamp(dot(nrm, normalize(vec3(-0.55, 0.65, 0.62))), 0.0, 1.0);
    float tone = vn(p*3.0)*0.6 + vn(p*7.0)*0.4;
    vec3 low = mix(vec3(0.34,0.39,0.23), vec3(0.44,0.43,0.29), tone);
    vec3 forest = vec3(0.16,0.25,0.14), rock = vec3(0.40,0.37,0.31);
    vec3 lc = mix(low, forest, smoothstep(0.16, 0.40, h + det*0.12));
    lc = mix(lc, rock, smoothstep(0.60, 0.88, h + det*0.1));
    lc *= 0.42 + 0.95*sun;
    float shallow = textureLod(tLand, luv, 4.5).r;
    vec3 sea = mix(vec3(0.03,0.07,0.15), vec3(0.06,0.17,0.28), smoothstep(0.02, 0.5, shallow));
    sea *= 0.92 + 0.12*vn(p*14.0 + uTime*0.02);
    vec3 col = mix(sea, lc, land);
    float lum = dot(col, vec3(0.3,0.59,0.11));
    col = mix(vec3(lum), col, 0.78);

    // neighbours
    col = mix(col, col*0.6 + vec3(0.22,0.05,0.06)*0.5, china*0.55);
    col = mix(col, col*0.85 + vec3(0.06,0.08,0.09), japan*0.5);

    // ---- control field ----
    vec2 guvRaw = (p - uGridBox.xy) / uGridBox.zw;
    vec2 fx = mix(bicubic(tX1, guvRaw, uGridSize).rg, bicubic(tX2, guvRaw, uGridSize).rg, uMix);
    float heat = clamp(fx.r, 0.0, 1.0)*korea, wake = clamp(fx.g, 0.0, 1.0);
    vec2 gp = p + warp(p) + warpLive(p, heat);
    vec2 guv = (gp - uGridBox.xy) / uGridBox.zw;
    float c0 = bicubic(tF0, guv, uGridSize).r, c1 = bicubic(tF1, guv, uGridSize).r, c2 = bicubic(tF2, guv, uGridSize).r, c3 = bicubic(tF3, guv, uGridSize).r;
    float cr = cr4(c0, c1, c2, c3, uMix)*2.0 - 1.0;
    float c = cr + edgeNoise(p);
    if (uGrid > 0.5) { // debug: what the simulation actually sees
      vec2 gi = floor(guvRaw*uGridSize); float raw = texelFetch(tF2, ivec2(clamp(gi, vec2(0), uGridSize-1.0)), 0).r*2.0-1.0;
      c = raw; vec2 gf = fract(guvRaw*uGridSize); float gl = step(0.92, max(gf.x, gf.y));
      col = mix(col, vec3(0.0), gl*0.35*korea*smoothstep(0.004, 0.0015, uUpp));
    }
    float north = aaStep(c);
    vec3 side = mix(uSouth, uNorth, north);
    float sl = dot(col, vec3(0.33));
    col = mix(col, side*(0.35 + 1.25*sl), 0.6*korea);
    // freshly taken ground shines in the winner's colour, then settles
    col = mix(col, side*1.3 + 0.06, wake*wake*0.38*korea);
    // battle haze over the contact zone
    col = mix(col, col*0.82 + vec3(0.30,0.16,0.08)*0.25, heat*0.35*vn(p*38.0 + vec2(uTime*0.35, 0.0)));

    // pockets: hatched
    float pk = bicubic(tPocket, guv, uGridSize).r;
    float stripe = step(0.5, fract((fc.x + fc.y) / (9.0*uDpr)));
    col = mix(col, col*0.45 + vec3(0.95,0.78,0.30)*0.35*stripe, smoothstep(0.35, 0.6, pk)*korea*0.8);

    // front line: constant pixel width at every zoom
    float w = max(fwidth(c), 1e-5); float dpx = abs(c)/w / uDpr;
    float core = exp(-dpx*dpx*0.7), glow = exp(-dpx/(4.0 + 5.0*heat));
    float flick = 0.72 + 0.28*sin(uTime*11.0 + vn(p*30.0)*6.28);
    float hh = heat*flick;
    vec3 glowCol = mix(vec3(0.35,0.7,1.0), vec3(1.0,0.3,0.35), north);
    vec3 coreCol = mix(vec3(1.0,0.94,0.93), vec3(1.0,0.84,0.58), hh);
    col += (coreCol*core*(0.7 + 0.55*hh) + mix(glowCol, vec3(1.0,0.55,0.25), hh*0.6)*glow*(0.16 + 0.6*hh)) * korea;

    // 38th parallel (dashed)
    float d38 = abs(p.y - 8.0)/uUpp/uDpr;
    float dash = step(0.45, fract(fc.x/(12.0*uDpr)));
    col = mix(col, vec3(1.0), (1.0-smoothstep(0.5, 1.4, d38))*dash*0.6*korea*(1.0-uDmzOn*0.6));

    // DMZ after the armistice
    if (uDmzOn > 0.5) {
      float cd = bicubic(tDmz, guv, uGridSize).r*2.0-1.0 + edgeNoise(p)*0.6;
      float wd = max(fwidth(cd), 1e-5); float dd = abs(cd)/wd/uDpr;
      col = mix(col, vec3(0.97), (1.0-smoothstep(2.0, 3.5, dd))*0.75*korea);
      col = mix(col, vec3(0.05), (1.0-smoothstep(0.4, 1.0, dd))*0.6*korea);
    }

    // coastline + Korea–China border
    float ec = abs(L.r - 0.5 + coast)/max(fwidth(L.r), 1e-5)/uDpr;
    col += vec3(0.85,0.9,1.0)*exp(-ec*ec*0.5)*0.10;
    float eb = abs(L.g - 0.5)/max(fwidth(L.g), 1e-5)/uDpr;
    col = mix(col, vec3(0.92,0.88,0.84), exp(-eb*eb*0.6)*0.35*land*(1.0-step(0.5, abs(L.r-0.5)*0.0)));

    // vignette
    vec2 q = fc/uRes - 0.5; col *= 1.0 - 0.38*pow(length(q*vec2(1.2, 1.0)), 2.2);
    o = vec4(pow(col, vec3(0.97)), 1.0);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function tex(gl, w, h, fmt, data, opts) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const f = fmt === 'r8' ? [gl.R8, gl.RED] : fmt === 'rg8' ? [gl.RG8, gl.RG] : [gl.RGBA8, gl.RGBA];
    gl.texImage2D(gl.TEXTURE_2D, 0, f[0], w, h, 0, f[1], gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts && opts.mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (opts && opts.mip) gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  }

  // Rasterize country polygons into one RGBA mask (R land, G Korea, B China/Russia, A Japan/Taiwan)
  function rasterLand(region) {
    const cv = document.createElement('canvas'); cv.width = LTW; cv.height = LTH;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const sx = LTW / LB.w, sy = LTH / LB.h;
    const layer = (codes) => {
      ctx.clearRect(0, 0, LTW, LTH); ctx.fillStyle = '#fff'; ctx.beginPath();
      for (const code of codes) for (const ring of S.decodeRings(region[code] || [])) {
        ring.forEach((pt, i) => { const x = (pt[0] - LB.x) * sx, y = (pt[1] - LB.y) * sy; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath();
      }
      ctx.fill('evenodd'); return ctx.getImageData(0, 0, LTW, LTH).data;
    };
    const all = layer(['NK', 'SK', 'CN', 'RU', 'MN', 'JP', 'TW']), kor = layer(['NK', 'SK']), cn = layer(['CN', 'RU', 'MN']), jp = layer(['JP', 'TW']);
    const out = new Uint8Array(LTW * LTH * 4);
    for (let i = 0, j = 0; i < out.length; i += 4, j += 4) { out[i] = all[j + 3]; out[i + 1] = kor[j + 3]; out[i + 2] = cn[j + 3]; out[i + 3] = jp[j + 3]; }
    return out;
  }

  function Renderer(canvas, sim, region) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas; this.sim = sim;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.map = program(gl, MAP_FS);
    this.tLand = tex(gl, LTW, LTH, 'rgba', rasterLand(region), { mip: true });
    this.tHeight = this.bakeHeight();
    this.fieldBuf = new Uint8Array(N);
    this.tF = [0, 1, 2, 3].map(() => tex(gl, GW, GH, 'r8', null));
    this.tX = [0, 1, 2, 3].map(() => tex(gl, GW, GH, 'rg8', null));
    this.fxBuf = new Uint8Array(N * 2);
    this.tPocket = tex(gl, GW, GH, 'r8', null);
    this.tDmz = tex(gl, GW, GH, 'r8', null);
    this.head = 0;
    // nearest Korean cell for every grid cell, so sampling near coasts doesn't invent a front
    this.near = new Int32Array(N).fill(-1);
    { const q = new Int32Array(N); let h = 0, t = 0;
      for (let k = 0; k < N; k++) if (sim.kor[k]) { this.near[k] = k; q[t++] = k; }
      while (h < t) { const k = q[h++], i = k % GW;
        for (const n of [i > 0 ? k - 1 : -1, i < GW - 1 ? k + 1 : -1, k - GW, k + GW]) if (n >= 0 && n < N && this.near[n] < 0) { this.near[n] = this.near[k]; q[t++] = n; } } }
    this.primeField();
  }
  const R = Renderer.prototype;
  R.bakeHeight = function () {
    const gl = this.gl, W = LTW, H = LTH;
    const prog = program(gl, BAKE_FS);
    const t = tex(gl, W, H, 'r8', null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.viewport(0, 0, W, H); gl.useProgram(prog.p);
    gl.uniform4f(prog.u.uBox, LB.x, LB.y, LB.w, LB.h); gl.uniform2f(prog.u.uSize, W, H);
    const ra = [], rb = [];
    for (const r of RIDGES_WORLD()) { ra.push(r[0], r[1], r[2], r[3]); rb.push(r[4], r[5]); }
    gl.uniform4fv(prog.u.uRA, ra); gl.uniform2fv(prog.u.uRB, rb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  };
  function RIDGES_WORLD() {
    const R0 = [[128.45, 38.85, 129.30, 36.10, 0.38, 0.80], [129.25, 36.10, 128.95, 35.35, 0.30, 0.45], [128.50, 36.95, 127.30, 35.20, 0.34, 0.60], [126.30, 41.45, 127.70, 39.35, 0.42, 0.80], [128.00, 41.00, 129.80, 42.35, 0.48, 0.85], [127.50, 40.95, 128.70, 40.55, 0.60, 0.65], [127.20, 39.05, 128.35, 38.60, 0.34, 0.50], [126.90, 38.40, 127.60, 37.90, 0.30, 0.35]];
    return R0.map(r => { const a = proj(r[0], r[1]), b = proj(r[2], r[3]); return [a[0], a[1], b[0], b[1], r[4], r[5]]; });
  }
  R.fill = function (arr, fn) { const b = this.fieldBuf, nr = this.near; for (let k = 0; k < N; k++) { const s = nr[k]; b[k] = s < 0 ? 128 : fn(arr, s); } return b; };
  R.put = function (t, data, fmt) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, GH, fmt || gl.RED, gl.UNSIGNED_BYTE, data); };
  // Call after every sim day. Snapshots go into a ring of four; the map is drawn
  // between the 2nd and 3rd newest with Catmull-Rom, so motion lags the sim by a day or two.
  R.uploadField = function () {
    this.head = (this.head + 1) % 4;
    const enc = (a, s) => Math.max(0, Math.min(255, Math.round((a[s] + 1) * 127.5)));
    this.put(this.tF[this.head], this.fill(this.sim.c, enc));
    const b = this.fxBuf, nr = this.near, sim = this.sim;
    for (let k = 0; k < N; k++) { const s = nr[k]; if (s < 0) { b[2 * k] = 0; b[2 * k + 1] = 0; continue; }
      b[2 * k] = Math.min(255, sim.heat[s] * 255) | 0; b[2 * k + 1] = Math.max(0, 255 - sim.flipAge[s] * 24) | 0; }
    this.put(this.tX[this.head], b, this.gl.RG);
    this.put(this.tPocket, this.fill(this.sim.pocket, (a, s) => a[s] ? 255 : 0));
    if (this.sim.dmz && !this.dmzDone) { this.put(this.tDmz, this.fill(this.sim.dmz, enc)); this.dmzDone = true; }
  };
  R.primeField = function () { for (let i = 0; i < 4; i++) this.uploadField(); };
  R.setSim = function (sim) { this.sim = sim; this.dmzDone = false; this.primeField(); };

  R.draw = function (view, mix, time, opts) {
    const gl = this.gl, c = this.canvas, u = this.map.u;
    gl.viewport(0, 0, c.width, c.height); gl.useProgram(this.map.p);
    gl.uniform2f(u.uRes, c.width, c.height); gl.uniform2f(u.uCenter, view.x, view.y);
    const px = c.width / view.w; // device pixels per CSS pixel (includes adaptive scaling)
    gl.uniform1f(u.uUpp, view.upp / px); gl.uniform1f(u.uDpr, px);
    gl.uniform1f(u.uMix, mix); gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uDmzOn, this.sim.dmz ? 1 : 0); gl.uniform1f(u.uGrid, opts.grid ? 1 : 0);
    gl.uniform4f(u.uLandBox, LB.x, LB.y, LB.w, LB.h); gl.uniform2f(u.uLandSize, LTW, LTH);
    gl.uniform4f(u.uGridBox, GX0, GY0, GW * CELL, GH * CELL); gl.uniform2f(u.uGridSize, GW, GH);
    gl.uniform3f(u.uNorth, 0.86, 0.13, 0.20); gl.uniform3f(u.uSouth, 0.13, 0.50, 0.86);
    const bind = (t, unit, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], unit); };
    bind(this.tLand, 0, 'tLand'); bind(this.tHeight, 1, 'tHeight');
    const h = this.head, at = i => (h + 1 + i) % 4; // at(0) oldest … at(3) newest
    bind(this.tF[at(0)], 2, 'tF0'); bind(this.tF[at(1)], 3, 'tF1'); bind(this.tF[at(2)], 4, 'tF2'); bind(this.tF[at(3)], 5, 'tF3');
    bind(this.tPocket, 6, 'tPocket'); bind(this.tDmz, 7, 'tDmz');
    bind(this.tX[at(1)], 8, 'tX1'); bind(this.tX[at(2)], 9, 'tX2');
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  root.BellumRender = { Renderer, LB };
})(typeof window !== 'undefined' ? window : globalThis);
