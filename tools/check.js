// QA for the built site: run after `node build.js`. Exit code 1 if any check fails.
//   node tools/check.js
// Checks every page in dist/ for the build's definition of done: one H1, title/description lengths and
// uniqueness, noindex (preview), canonical + Open Graph, JSON-LD types, heading order, broken internal links and
// anchors, disclaimers and footer attribution, draft notes, keyword placement, sitemap coverage and leftover
// template strings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { SITE_URL, BASE_PATH } from '../site.config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const report = JSON.parse(fs.readFileSync(path.join(ROOT, '.build-report.json'), 'utf8'));
const PREVIEW = report.preview;
const fails = [];
const notes = [];
const fail = (route, msg) => fails.push(`${route}: ${msg}`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const htmlFiles = walk(DIST).filter((f) => f.endsWith('.html'));
const routeOf = (f) => { const r = '/' + path.relative(DIST, f).split(path.sep).join('/'); return r.endsWith('/index.html') ? r.slice(0, -10) : r; };
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const meta = (h, attr, name) => { const m = h.match(new RegExp(`<meta ${attr}="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="([^"]*)"`)); return m ? m[1] : null; };
const toks = (s) => s.toLowerCase().replace(/&[a-z]+;/g, ' ').replace(/[^a-z0-9.]+/g, ' ').replace(/\.(?=\s|$)/g, '').split(/\s+/).filter(Boolean);
function hasKeyword(hay, kw, maxGap = 3) {
  const h = toks(hay), k = toks(kw);
  for (let s = 0; s < h.length; s++) {
    if (h[s] !== k[0]) continue;
    let i = s, ok = true;
    for (let j = 1; j < k.length; j++) {
      let found = -1;
      for (let t = i + 1; t <= Math.min(h.length - 1, i + 1 + maxGap); t++) if (h[t] === k[j]) { found = t; break; }
      if (found < 0) { ok = false; break; }
      i = found;
    }
    if (ok) return true;
  }
  return false;
}

// source front matter by route (for keyword checks)
const srcByRoute = new Map();
const pagesDir = path.join(ROOT, 'src/pages');
for (const f of walk(pagesDir).filter((x) => /\.(md|html)$/.test(x))) {
  const rel = path.relative(pagesDir, f).split(path.sep).join('/').replace(/\.(md|html)$/, '');
  const route = rel === 'index' ? '/' : rel === '404' ? '/404.html' : '/' + rel.replace(/\/?index$/, '') + '/';
  srcByRoute.set(route, matter(fs.readFileSync(f, 'utf8')).data);
}
for (const f of walk(path.join(ROOT, 'src/posts')).filter((x) => x.endsWith('.md'))) srcByRoute.set(`/blog/${path.basename(f, '.md')}/`, { ...matter(fs.readFileSync(f, 'utf8')).data, _post: true });

const pages = new Map();
for (const f of htmlFiles) pages.set(routeOf(f), fs.readFileSync(f, 'utf8'));
const strip = (r) => (BASE_PATH && r.startsWith(BASE_PATH) ? r.slice(BASE_PATH.length) || '/' : r);
const ids = new Map([...pages].map(([r, h]) => [r, new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));

const titles = new Map(), descs = new Map(), kws = new Map();
const rows = [];
let linkCount = 0, broken = 0, noindex = 0;

for (const [route, h] of pages) {
  const is404 = route === '/404.html';
  const row = { route };
  // one H1
  const h1s = [...h.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)];
  if (h1s.length !== 1) fail(route, `${h1s.length} <h1> elements`);
  // title + description
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = meta(h, 'name', 'description') || '';
  const tl = text(title).length, dl = text(desc).length;
  if (!tl || tl > 60) fail(route, `title length ${tl}`);
  if (!dl || dl > 155) fail(route, `description length ${dl}`);
  if (titles.has(title)) fail(route, `duplicate title with ${titles.get(title)}`); else titles.set(title, route);
  if (descs.has(desc)) fail(route, `duplicate description with ${descs.get(desc)}`); else descs.set(desc, route);
  // robots
  const robots = meta(h, 'name', 'robots');
  if (robots === 'noindex, nofollow') noindex++;
  if (PREVIEW && robots !== 'noindex, nofollow') fail(route, 'missing noindex, nofollow');
  // canonical + OG
  if (!is404) {
    const can = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (!can || !can.startsWith(SITE_URL + '/')) fail(route, `canonical ${can}`);
    else if (can !== SITE_URL + route) fail(route, `canonical ${can} does not match the page URL`);
    for (const p of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image']) if (!meta(h, 'property', p)) fail(route, `missing ${p}`);
    for (const n of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) if (!meta(h, 'name', n)) fail(route, `missing ${n}`);
    // JSON-LD
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (ld.length !== 1) fail(route, `${ld.length} JSON-LD blocks`);
    try {
      const g = JSON.parse(ld[0][1])['@graph'];
      const types = new Set(g.flatMap((n) => [].concat(n['@type'])));
      for (const t of ['LegalService', 'Attorney', 'Person', 'WebSite', 'WebPage']) if (!types.has(t)) fail(route, `JSON-LD missing ${t}`);
      if (route !== '/' && !types.has('BreadcrumbList')) fail(route, 'JSON-LD missing BreadcrumbList');
      if (srcByRoute.get(route)?._post && !types.has('BlogPosting')) fail(route, 'JSON-LD missing BlogPosting');
      if (route === '/faq/' && !types.has('FAQPage')) fail(route, 'JSON-LD missing FAQPage');
      if (route !== '/faq/' && types.has('FAQPage')) fail(route, 'FAQPage outside /faq/');
      if (g.some((n) => n.address)) fail(route, 'address in schema before it is confirmed');
      row.schema = [...types].filter((t) => !['WebPage', 'ListItem'].includes(t)).join(' ');
    } catch (e) { fail(route, 'JSON-LD does not parse: ' + e.message); }
  }
  // heading order inside <main>
  const main = (h.match(/<main id="main">([\s\S]*)<\/main>/) || [])[1] || '';
  let prev = 0;
  for (const m of main.matchAll(/<h([1-6])[\s>]/g)) { const lv = +m[1]; if (prev && lv > prev + 1) { fail(route, `heading jumps h${prev} → h${lv}`); break; } prev = lv; }
  // internal links + anchors
  for (const m of h.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(u)) continue;
    linkCount++;
    if (u.startsWith('#')) { if (u.length > 1 && !ids.get(route).has(u.slice(1))) { broken++; fail(route, `broken anchor ${u}`); } continue; }
    if (BASE_PATH && !u.startsWith(BASE_PATH + '/')) { broken++; fail(route, `link without base path: ${u}`); continue; }
    const [p0, hash] = strip(u).split('#');
    const p = p0.split('?')[0];
    let file = path.join(DIST, p);
    if (p.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { broken++; fail(route, `broken link ${u}`); continue; }
    if (hash && p.endsWith('/') && !ids.get(p)?.has(hash)) { broken++; fail(route, `broken anchor ${u}`); }
  }
  // compliance strings
  const t = text(h);
  for (const s of ['Attorney Advertising', 'Prior results do not guarantee a similar outcome', 'This website is general information, not legal advice; contacting us does not create an attorney-client relationship', 'Responsible attorney', 'Mark S. Gorski', '503-224-1843']) if (!t.includes(s)) fail(route, `missing "${s}"`);
  if (/reviewed by mark/i.test(t)) fail(route, 'says "reviewed by Mark"');
  if (/\{\{\s*CONFIRM/.test(h)) fail(route, 'shows a {{CONFIRM}} placeholder (unknowns are left out of the site; questions for Mark live in CONFIRM.md)');
  if (PREVIEW && !t.includes('Concept preview — not the official Gorski Law website.')) fail(route, 'missing preview ribbon');
  if (!h.includes('href="tel:+15032241843"')) fail(route, 'no tel: link');
  const fm = srcByRoute.get(route) || {};
  if ((fm.layout === 'practice' || fm._post) && !t.includes('Draft — attorney review pending')) fail(route, 'missing draft note');
  if ((fm.layout === 'practice' || fm._post) && !h.includes('class="author"')) fail(route, 'missing author box');
  // keywords
  if (fm.primary_keyword && !is404) {
    const kw = fm.primary_keyword;
    if (kws.has(kw.toLowerCase())) fail(route, `primary keyword "${kw}" also used by ${kws.get(kw.toLowerCase())}`); else kws.set(kw.toLowerCase(), route);
    const h1t = text(h1s[0]?.[0] || '');
    const after = text(main.split(/<\/h1>/)[1] || '').split(' ').slice(0, 100).join(' ');
    row.kw = kw;
    row.inTitle = hasKeyword(text(title), kw);
    row.inH1 = hasKeyword(h1t, kw);
    row.in100 = hasKeyword(after, kw);
    row.inDesc = hasKeyword(text(desc), kw);
    const miss = ['inTitle', 'inH1', 'in100', 'inDesc'].filter((k) => !row[k]);
    if (miss.length) fail(route, `primary keyword "${kw}" not in ${miss.join(', ')}`);
  }
  if (fm._post) {
    const money = fm.target_money_page;
    const body = (h.match(/<article class="doc__main">([\s\S]*?)<div class="callbox">/) || [])[1] || '';
    if (!body.includes(`href="${BASE_PATH}${money}"`)) fail(route, `body does not link to its money page ${money}`);
    for (const s of fm.related_posts || []) if (!body.includes(`href="${BASE_PATH}/blog/${s}/"`)) notes.push(`${route}: related post ${s} linked only in the cards, not in the body`);
    row.words = report.pages.find((p) => p.route === route)?.words;
  }
  if (fm.layout === 'practice') row.words = report.pages.find((p) => p.route === route)?.words;
  rows.push(row);
}

// contact form in preview
if (PREVIEW) {
  const c = pages.get('/contact/') || '';
  if (!/<form class="qform" data-preview/.test(c) || !/<fieldset disabled>/.test(c) || !/type="submit" disabled/.test(c) || /<form[^>]*action=/.test(c)) fail('/contact/', 'preview form is not fully disabled');
  if (!text(c).includes('Preview only — call 503-224-1843')) fail('/contact/', 'missing "Preview only — call 503-224-1843"');
}
// sitemap
const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
for (const r of pages.keys()) if (r !== '/404.html' && !locs.has(SITE_URL + r)) fail(r, 'not in sitemap.xml');
for (const l of locs) if (!pages.has(l.slice(SITE_URL.length))) fail(l, 'in sitemap but not built');
for (const f of ['robots.txt', 'rss.xml', 'llms.txt', 'sitemap.xml']) if (!fs.existsSync(path.join(DIST, f))) fail('/', `missing ${f}`);
const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
if (/^Disallow:\s*\S/m.test(robots)) fail('/robots.txt', 'has a Disallow rule (would hide the noindex tag)');

// leftovers anywhere in the repo (sources, docs, build output)
const scan = walk(ROOT).filter((f) => !/node_modules|\.git\/|\.ors-cache|\.lighthouse|\.png$|\.webp$|\.woff2$/.test(f) && !f.endsWith('tools/check.js'));
const banned = [/redstone/i, /orlando/i, /florida/i, /\bfamily law\b/i, /personal injury/i, /\bcorporate\b/i];
for (const f of scan) {
  const s = fs.readFileSync(f, 'utf8');
  for (const b of banned) if (b.test(s)) fail(path.relative(ROOT, f), `contains ${b}`);
}
// wording flags (reported, not failed): superlatives and outcome words in the built text
const flagRe = /\b(best|top-rated|#1|number one|leading|unparalleled|premier|expert|specialist|speciali[sz]es?|guarantee[sd]?|aggressive)\b/gi;
const flags = new Map();
for (const [route, h] of pages) {
  const t = text((h.match(/<main id="main">([\s\S]*)<\/main>/) || [])[1] || '');
  for (const m of t.matchAll(flagRe)) { const k = m[0].toLowerCase(); const ctx = t.slice(Math.max(0, m.index - 50), m.index + 50); if (!flags.has(k)) flags.set(k, []); flags.get(k).push(`${route}: …${ctx}…`); }
}

// output
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nChecked ${pages.size} pages in dist/ (${PREVIEW ? 'preview' : 'production'} build, SITE_URL ${SITE_URL})`);
console.log(`noindex on ${noindex}/${pages.size} pages · ${linkCount} internal links/assets checked, ${broken} broken · ${locs.size} URLs in sitemap\n`);
console.log(pad('Route', 58) + pad('Primary keyword', 46) + 'T H1 100 D  words');
for (const r of rows.filter((x) => x.kw).sort((a, b) => a.route.localeCompare(b.route))) {
  const y = (b) => (b ? '✓' : '✗');
  console.log(pad(r.route, 58) + pad(r.kw, 46) + `${y(r.inTitle)} ${y(r.inH1)}  ${y(r.in100)}  ${y(r.inDesc)}  ${r.words ?? ''}`);
}
if (flags.size) {
  console.log('\nWording to review (superlatives / outcome words found in page text):');
  for (const [k, list] of flags) console.log(`  "${k}" ×${list.length}\n    ` + list.slice(0, 4).join('\n    '));
}
if (notes.length) { console.log(`\nNotes (${notes.length}):`); notes.slice(0, 30).forEach((n) => console.log('  - ' + n)); }
console.log(`\n${fails.length ? `FAIL: ${fails.length} problem(s)` : 'PASS: all checks'}`);
fails.forEach((f) => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
