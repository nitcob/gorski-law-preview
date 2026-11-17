// Draws the hero background: contour lines of a made-up river gorge (a nod to the Columbia), as one SVG.
// Seeded value noise + a sinuous valley, traced with marching squares and joined into polylines. Deterministic,
// so every build produces the same file. No dependencies.

const W = 1600, H = 900;       // viewBox
const GX = 160, GY = 90;       // sample grid (cells)

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function noise2(seed) {
  const r = rng(seed), N = 256, perm = [], val = [];
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = r(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const h = (x, y) => val[perm[(perm[x & 255] + y) & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function field(seed) {
  const n = noise2(seed);
  const f = [];
  for (let j = 0; j <= GY; j++) {
    const row = [];
    for (let i = 0; i <= GX; i++) {
      const x = i / GX, y = j / GY;
      let v = 0, amp = 1, fr = 3.2, tot = 0;
      for (let o = 0; o < 4; o++) { v += amp * n(x * fr * 1.78 + o * 17.3, y * fr + o * 9.1); tot += amp; amp *= 0.5; fr *= 2.03; }
      v /= tot;
      // a river valley running west to east, low in the middle of the frame
      const ry = 0.62 + 0.09 * Math.sin(x * 5.2 + 0.6) + 0.04 * Math.sin(x * 13.0);
      const d = Math.abs(y - ry);
      v = v * 0.78 + Math.min(d * 1.9, 0.62) * 0.55 - 0.16 * Math.exp(-(d * d) / 0.0035);
      row.push(v);
    }
    f.push(row);
  }
  return f;
}

function contours(f, level) {
  const segs = [];
  const P = (i, j) => [i * W / GX, j * H / GY];
  const lerp = (a, b, va, vb) => { const t = (level - va) / (vb - va || 1e-9); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const v0 = f[j][i], v1 = f[j][i + 1], v2 = f[j + 1][i + 1], v3 = f[j + 1][i];
    const c = (v0 > level ? 8 : 0) | (v1 > level ? 4 : 0) | (v2 > level ? 2 : 0) | (v3 > level ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const p0 = P(i, j), p1 = P(i + 1, j), p2 = P(i + 1, j + 1), p3 = P(i, j + 1);
    const top = () => lerp(p0, p1, v0, v1), right = () => lerp(p1, p2, v1, v2), bottom = () => lerp(p3, p2, v3, v2), left = () => lerp(p0, p3, v0, v3);
    const table = { 1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]], 10: [[top, right], [left, bottom]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]] };
    for (const [a, b] of table[c]) segs.push([a(), b()]);
  }
  // join segments into polylines by matching endpoints
  const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const ends = new Map();
  segs.forEach((s, k) => { for (const e of [0, 1]) { const kk = key(s[e]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(k); } });
  const used = new Uint8Array(segs.length), lines = [];
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const line = [segs[k][0], segs[k][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) || []).find((m) => !used[m]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next], other = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(other); else line.unshift(other);
      }
    }
    if (line.length > 3) lines.push(line);
  }
  return lines;
}

function simplify(line, tol = 1.1) {
  if (line.length < 3) return line;
  const out = [line[0]];
  for (let i = 1; i < line.length - 1; i++) {
    const a = out[out.length - 1], b = line[i], c = line[i + 1];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    if (area > tol * Math.hypot(c[0] - a[0], c[1] - a[1])) out.push(b);
  }
  out.push(line[line.length - 1]);
  return out;
}

export function topoSVG({ seed = 1991, levels = 22, stroke = '#f3f0e9', accent = '#e8774a' } = {}) {
  const f = field(seed);
  let lo = Infinity, hi = -Infinity;
  for (const r of f) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const paths = { minor: [], index: [], river: [] };
  for (let k = 1; k < levels; k++) {
    const lv = lo + (hi - lo) * (k / levels);
    const d = contours(f, lv).map((l) => 'M' + simplify(l).map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')).join('');
    if (!d) continue;
    if (k === 2) paths.river.push(d); else if (k % 5 === 0) paths.index.push(d); else paths.minor.push(d);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="${paths.minor.join('')}" stroke="${stroke}" stroke-opacity=".085" stroke-width="1"/>`
    + `<path d="${paths.index.join('')}" stroke="${stroke}" stroke-opacity=".17" stroke-width="1.4"/>`
    + `<path d="${paths.river.join('')}" stroke="${accent}" stroke-opacity=".42" stroke-width="1.6"/>`
    + `</svg>`;
}
