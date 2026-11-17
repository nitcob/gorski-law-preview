// Gorski Law concept preview: the whole build. Plain Node + two dev dependencies (marked, gray-matter).
//   node build.js                 preview build (noindex, ribbon, form off) into dist/
//   PREVIEW=false node build.js   production build (see LAUNCH.md)
// It stamps the shared header and footer into every page, renders the Markdown pages and posts, writes the
// JSON-LD, and generates sitemap.xml, robots.txt, rss.xml and llms.txt from SITE_URL. Every internal link and
// asset is written root-relative in the sources and prefixed with BASE_PATH here, once, at the end.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import matter from 'gray-matter';
import { SITE_URL, BASE_PATH, PREVIEW, FORM_ACTION, FIRM, BUILD_DATE } from './site.config.js';
import { topoSVG } from './tools/topo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const warnings = [];
const warn = (m) => warnings.push(m);

/* ---------------------------------------------------------------- helpers */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (route) => SITE_URL + route;
const TEL = `tel:${FIRM.phoneE164}`;
const icon = (n, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const slugify = (s) => String(s).toLowerCase().replace(/&[a-z]+;/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = (s) => String(s).replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const CONFIRM_RE = /\{\{\s*CONFIRM:\s*([^}]*?)\s*\}\}/g;
const confirmify = (html) => html.replace(CONFIRM_RE, (_, t) => `<mark class="confirm">{{CONFIRM: ${t}}}</mark>`);
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || BUILD_DATE).slice(0, 10));
const hash = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
const words = (md) => md.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_|`-]/g, ' ').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
function write(rel, content) {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

/* ---------------------------------------------------------------- content model */
const ORDER = [
  '/', '/duii-defense/', '/duii-defense/diversion/', '/duii-defense/dmv-implied-consent-hearing/', '/duii-defense/breath-test-refusal/',
  '/duii-defense/drug-and-marijuana-duii/', '/duii-defense/repeat-and-felony-duii/', '/traffic-tickets/', '/traffic-tickets/cdl-commercial-drivers/',
  '/traffic-tickets/speeding/', '/traffic-tickets/driving-while-suspended/', '/traffic-tickets/reckless-and-careless-driving/', '/criminal-defense/',
  '/criminal-defense/domestic-violence/', '/criminal-defense/assault/', '/criminal-defense/theft/', '/criminal-defense/drug-charges/',
  '/about-mark-gorski/', '/courts-we-serve/', '/blog/', '/faq/', '/contact/', '/legal/disclaimer/', '/legal/privacy/',
];
const rank = (r) => { const i = ORDER.indexOf(r); return i < 0 ? 999 : i; };

function load() {
  const pagesDir = path.join(SRC, 'pages');
  const pages = walk(pagesDir).filter((f) => /\.(md|html)$/.test(f)).map((file) => {
    const rel = path.relative(pagesDir, file).split(path.sep).join('/');
    const { data, content } = matter(fs.readFileSync(file, 'utf8'));
    const noext = rel.replace(/\.(md|html)$/, '');
    let route = noext === 'index' ? '/' : '/' + noext.replace(/\/?index$/, '') + '/';
    if (noext === '404') route = '/404.html';
    return { kind: 'page', file, rel, route, fm: data, src: content, isMd: file.endsWith('.md') };
  });
  const posts = walk(path.join(SRC, 'posts')).filter((f) => f.endsWith('.md')).map((file) => {
    const slug = path.basename(file, '.md');
    const { data, content } = matter(fs.readFileSync(file, 'utf8'));
    return { kind: 'post', file, slug, route: `/blog/${slug}/`, fm: { layout: 'post', ...data }, src: content, isMd: true };
  });
  posts.sort((a, b) => String(b.fm.date).localeCompare(String(a.fm.date)) || a.slug.localeCompare(b.slug));
  return { pages, posts, all: [...pages, ...posts] };
}

const { pages, posts, all } = load();
const byRoute = new Map(all.map((p) => [p.route, p]));
const postBySlug = new Map(posts.map((p) => [p.slug, p]));
const label = (p) => p.fm.crumb || p.fm.h1 || p.fm.title;
const parentRoute = (route) => {
  if (route === '/' || route === '/404.html') return null;
  const parts = route.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? '/' + parts.join('/') + '/' : '/';
};
const childrenOf = (route) => pages.filter((p) => parentRoute(p.route) === route && p.route !== route && p.fm.layout === 'practice').sort((a, b) => rank(a.route) - rank(b.route));
function crumbsOf(p) {
  const chain = [];
  for (let r = p.route; r; r = parentRoute(r)) {
    const q = byRoute.get(r);
    if (q) chain.unshift({ route: r, label: r === '/' ? 'Home' : label(q) });
    else if (r === '/legal/') continue;
  }
  return chain;
}

/* ---------------------------------------------------------------- markdown */
function renderMarkdown(src, { sections = true } = {}) {
  const toc = [];
  const ids = new Set();
  const uid = (base) => { let id = base, n = 2; while (ids.has(id)) id = `${base}-${n++}`; ids.add(id); return id; };
  const m = new Marked({ gfm: true });
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = decode(stripTags(inner));
        if (depth === 2 && sections) { const id = uid(slugify(text)); toc.push({ id, text }); return `\n<!--SEC:${id}-->\n<h2>${inner}</h2>\n`; }
        return `<h${depth} id="${uid(slugify(text))}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' rel="noopener"' : ''}>${inner}</a>`;
      },
    },
  });
  let html = m.parse(src);
  let tn = 0;
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, (all, inner) => {
    const heads = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => stripTags(x[1])).slice(0, 3).join(', ');
    tn++;
    return `<div class="table-wrap" role="region" tabindex="0" aria-label="${esc(`Table ${tn}: ${heads}`)}"><table>${inner}</table></div>`;
  });
  html = html.replace(/<blockquote>\s*<p><strong>(Deadline|Warning|Note|Important):?<\/strong>:?/g, (_, k) => `<blockquote class="callout callout--${k.toLowerCase()}"><p><strong>${k}:</strong>`);
  html = confirmify(html);
  if (sections) {
    const parts = html.split(/\n?<!--SEC:([a-z0-9-]+)-->\n?/);
    let out = parts[0].trim() ? `<div class="doc__sec">${parts[0]}</div>` : '';
    for (let i = 1; i < parts.length; i += 2) out += `<section class="doc__sec" id="${parts[i]}">${parts[i + 1]}</section>`;
    html = out;
  }
  return { html, toc };
}
const inline = (s) => confirmify(new Marked({ gfm: true }).parseInline(String(s ?? '')));

/* ---------------------------------------------------------------- shared components */
const SPRITE = `<svg class="sprite" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
<symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 3.5h3.2l1.6 4.2-2.1 1.5a11 11 0 0 0 5.1 5.1l1.5-2.1 4.2 1.6V17a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 5.5a2 2 0 0 1 2-2z"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
<symbol id="i-caret" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></symbol>
<symbol id="i-car" viewBox="0 0 24 24"><path d="M4 16.5V12l2-5h12l2 5v4.5z"/><path d="M4 12h16M6.5 16.5v2M17.5 16.5v2"/><circle cx="7.5" cy="14.2" r=".6"/><circle cx="16.5" cy="14.2" r=".6"/></symbol>
<symbol id="i-truck" viewBox="0 0 24 24"><path d="M2.5 16V6h11v10M13.5 9.5h4l3 3.5v3"/><path d="M5.2 17.5H2.5M13.5 16v1.5h-4.7M20.5 16v1.5h-1.7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></symbol>
<symbol id="i-scale" viewBox="0 0 24 24"><path d="M12 3.5v17M7.5 20.5h9M5 6.5h14"/><path d="M5 6.5 2.5 13a2.6 2.6 0 0 0 5 0zM19 6.5 16.5 13a2.6 2.6 0 0 0 5 0z"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></symbol>
<symbol id="i-doc" viewBox="0 0 24 24"><path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5M9 12h6M9 15.5h6"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20.5V5.5M8 7.5h7"/></symbol>
<symbol id="i-wind" viewBox="0 0 24 24"><path d="M3 8.5h10.5a2.8 2.8 0 1 0-2.8-2.8M3 12.5h15a3 3 0 1 1-3 3M3 16.5h7"/></symbol>
<symbol id="i-leaf" viewBox="0 0 24 24"><path d="M5 20c-.5-9 4.5-15 15-15.5.5 10-5 15.5-14 15.5"/><path d="M5 20c2.5-4 5.8-7.3 10-9.5"/></symbol>
<symbol id="i-gauge" viewBox="0 0 24 24"><path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 4-5"/><circle cx="12" cy="13" r="1.3"/></symbol>
<symbol id="i-idcard" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 13.5h3"/></symbol>
<symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2h.01"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7"/><path d="M5.8 9.4V20h12.4V9.4"/><path d="M10 20v-5.2h4V20"/></symbol>
<symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14a6 6 0 0 1 3.7 5.5"/></symbol>
<symbol id="i-pill" viewBox="0 0 24 24"><rect x="2.8" y="8.2" width="18.4" height="7.6" rx="3.8" transform="rotate(-40 12 12)"/><path d="m9.3 8.8 5.4 6.4"/></symbol>
<symbol id="i-map" viewBox="0 0 24 24"><path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></symbol>
<symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/></symbol>
<symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5.5h16v10H9.5L5 19.5v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/></symbol>
</svg>`;

/* ---------------------------------------------------------------- photos (Gorski Law's own, from gorski-law.com) */
const IMG = {
  bridge: { base: 'steel-bridge', sizes: [640, 800, 1024], w: 1024, h: 683, focus: '62% 50%', alt: "Portland's Steel Bridge under a blue sky, the bridge on the Gorski Law shield" },
  courthouse: { base: 'courthouse', sizes: [640, 800, 1024], w: 1024, h: 768, focus: 'center 45%', alt: 'A historic courthouse in downtown Portland, lit up at dusk' },
  policeCar: { base: 'police-car', sizes: [640, 800, 1066], w: 1066, h: 641, focus: '55% 60%', alt: 'A Portland Police patrol car parked by the river, with the Steel Bridge behind it' },
  policeSuv: { base: 'police-suv', sizes: [640, 800, 1434], w: 1434, h: 800, focus: '40% 50%', alt: 'A Portland Police SUV, close up' },
  motors: { base: 'motor-officers', sizes: [700], w: 700, h: 295, focus: '50% 50%', alt: 'Two police motorcycle officers, one aiming a speed-measuring device' },
  trucks: { base: 'trucks', sizes: [640, 960, 1600], w: 1600, h: 1072, focus: '60% 55%', alt: 'Semi-trucks parked side by side at a truck stop' },
  mark: { base: 'mark-gorski', sizes: [440], w: 440, h: 640, focus: 'center 25%', alt: 'Mark S. Gorski at a table, signing paperwork' },
  dogs: { base: 'columbia-dogs', sizes: [640, 1200], w: 1200, h: 988, focus: 'center 60%', alt: 'Dogs riding in a small boat on the Columbia River at sunset' },
  sunset: { base: 'columbia-sunset', sizes: [720], w: 720, h: 960, focus: 'center 55%', alt: 'Sunset light breaking through clouds over the Columbia River' },
};
const imgSrc = (k) => { const i = IMG[k]; return `/assets/img/${i.base}-${i.sizes[i.sizes.length - 1]}.webp`; };
const imgSet = (k) => IMG[k].sizes.map((s) => `/assets/img/${IMG[k].base}-${s}.webp ${s}w`).join(', ');
function img(k, { cls = '', sizes = '100vw', eager = false, style = '' } = {}) {
  const i = IMG[k];
  return `<img${cls ? ` class="${cls}"` : ''} src="${imgSrc(k)}"${i.sizes.length > 1 ? ` srcset="${imgSet(k)}" sizes="${sizes}"` : ''} alt="${esc(i.alt)}" width="${i.w}" height="${i.h}" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"'}${style ? ` style="${style}"` : ''}>`;
}
// inner-page hero photo by route (money pages and a few hubs); everything else gets the template's icon tile
const PAGE_PHOTO = { '/duii-defense/': 'policeCar', '/traffic-tickets/': 'motors', '/traffic-tickets/cdl-commercial-drivers/': 'trucks', '/traffic-tickets/speeding/': 'policeSuv', '/criminal-defense/': 'courthouse', '/about-mark-gorski/': 'mark', '/courts-we-serve/': 'courthouse', '/contact/': 'bridge' };
const PHERO_SIZES = '(max-width: 999px) 100vw, 40vw';
// every other page in a section borrows its section's photo; a post borrows the photo of the page it supports
function photoFor(p) {
  const r = p.kind === 'post' ? p.fm.target_money_page || '' : p.route;
  if (PAGE_PHOTO[r]) return PAGE_PHOTO[r];
  if (r.startsWith('/traffic-tickets/')) return 'motors';
  if (r.startsWith('/duii-defense/')) return 'policeCar';
  if (r.startsWith('/criminal-defense/')) return 'courthouse';
  if (r === '/blog/') return 'bridge';
  return null;
}

/* ---------------------------------------------------------------- header, footer, dock (template markup) */
const NAV = [
  { label: 'DUII defense', route: '/duii-defense/' },
  { label: 'Traffic & CDL', route: '/traffic-tickets/' },
  { label: 'Criminal defense', route: '/criminal-defense/' },
  { label: 'About Mark', route: '/about-mark-gorski/' },
  { label: 'Guides', route: '/blog/' },
];
const sectionOf = (route) => '/' + (route.split('/')[1] || '') + '/';

function ribbon() {
  if (!PREVIEW) return '';
  return `<div class="ribbon" role="region" aria-label="Preview notice"><div class="wrap ribbon__in"><span class="ribbon__dot" aria-hidden="true"></span><p>Concept preview — not the official Gorski Law website.</p><button class="ribbon__x" type="button" aria-label="Dismiss the preview notice">×</button></div></div>`;
}

function header(p) {
  const cur = p.route, sec = sectionOf(cur);
  const items = NAV.map((n) => `<li><a href="${n.route}"${cur === n.route || (sec === n.route && n.route !== '/') ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('');
  const menu = [
    ...NAV.slice(0, 3).flatMap((n) => [`<li><a href="${n.route}">${n.label}</a></li>`, ...childrenOf(n.route).map((k) => `<li><a href="${k.route}" style="padding-left:18px;font-weight:500">${esc(label(k))}</a></li>`)]),
    '<li><a href="/about-mark-gorski/">About Mark S. Gorski</a></li><li><a href="/blog/">Guides</a></li><li><a href="/faq/">FAQ</a></li><li><a href="/courts-we-serve/">Courts we serve</a></li><li><a href="/contact/">Contact</a></li>',
  ].join('');
  return `${ribbon()}
<div class="topbar" role="region" aria-label="Office hours and phone">
  <div class="wrap topbar__in">
    <p class="topbar__note">${icon('pin')}DUII, criminal and traffic defense across Oregon · Mon–Fri, 9 am – 5 pm</p>
    <a class="topbar__phone" href="${TEL}">${icon('phone')}Call ${FIRM.phone}</a>
  </div>
</div>
<header class="bar" id="bar">
  <div class="wrap bar__in">
    <a class="brand" href="/"><img class="brand__shield" src="/assets/img/gorski-shield-128.webp" alt="" width="128" height="155"><span class="brand__name">Gorski Law<span class="brand__tag">Defending Oregonians since 1991</span></span></a>
    <nav class="nav" aria-label="Main"><ul>${items}</ul></nav>
    <div class="bar__actions">
      <a class="btn btn--accent btn--sm bar__cta" href="${TEL}">${icon('phone')}${FIRM.phone}</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu"><span class="menu-btn__lines" aria-hidden="true"></span><span class="menu-btn__label">Menu</span></button>
    </div>
  </div>
  <nav class="menu" id="menu" aria-label="Menu" hidden><ul class="wrap">${menu}<li><a href="${TEL}">Call ${FIRM.phone}</a></li></ul></nav>
</header>`;
}

function hoursDL() {
  return `<dl class="hours">${FIRM.hours.map((h) => `<div><dt>${h.short}</dt><dd>${h.time}</dd></div>`).join('')}</dl>`;
}
const ADDRESS = FIRM.address ? esc(FIRM.address) : '{{CONFIRM: office street address (none is published on the current site)}}';
const EMAIL = FIRM.email ? `<a href="mailto:${esc(FIRM.email)}">${esc(FIRM.email)}</a>` : '{{CONFIRM: office email to publish}}';

function footer(p) {
  const pages1 = ['/duii-defense/', '/duii-defense/diversion/', '/duii-defense/dmv-implied-consent-hearing/', '/traffic-tickets/', '/traffic-tickets/cdl-commercial-drivers/', '/criminal-defense/'];
  const pages2 = ['/about-mark-gorski/', '/courts-we-serve/', '/blog/', '/faq/', '/contact/', '/legal/disclaimer/', '/legal/privacy/'];
  const li = (r) => byRoute.has(r) ? `<li><a href="${r}"${p.route === r ? ' aria-current="page"' : ''}>${esc(label(byRoute.get(r)))}</a></li>` : '';
  return `<footer class="foot">
  <div class="wrap foot__grid foot__grid--multi">
    <div class="foot__brand">
      <a class="brand brand--light" href="/"><img class="brand__shield" src="/assets/img/gorski-shield-128.webp" alt="" width="128" height="155"><span class="brand__name">Gorski Law<span class="brand__tag">Defending Oregonians since 1991</span></span></a>
      <p class="foot__tag">Criminal, DUII and traffic defense for clients throughout Oregon, from a Portland-metro base.</p>
    </div>
    <div class="foot__col">
      <h2 class="foot__h">Contact</h2>
      <address class="nap"><span class="nap__name">Gorski Law</span><a href="${TEL}">${FIRM.phone}</a><span>${ADDRESS}</span><span>${EMAIL}</span><a href="${FIRM.facebook}" rel="noopener">Facebook: trialmoose</a></address>
    </div>
    <div class="foot__col"><h2 class="foot__h">Hours</h2>${hoursDL()}</div>
    <nav class="foot__col" aria-label="Practice areas"><h2 class="foot__h">Practice areas</h2><ul class="foot__pages">${pages1.map(li).join('')}</ul></nav>
    <nav class="foot__col" aria-label="Firm"><h2 class="foot__h">Firm</h2><ul class="foot__pages">${pages2.map(li).join('')}<li><a href="/rss.xml">RSS feed</a></li></ul></nav>
  </div>
  <div class="wrap foot__legal"><div class="foot__demo"><span class="demo-tag__dot" aria-hidden="true"></span><div>
    <p><strong>Attorney Advertising.</strong> Prior results do not guarantee a similar outcome. This website is general information, not legal advice; contacting us does not create an attorney-client relationship.</p>
    <p>Responsible attorney: <strong>Mark S. Gorski</strong>, Oregon State Bar No. 912881, Gorski Law, <a href="${TEL}" style="color:inherit">${FIRM.phone}</a>.${PREVIEW ? ' <strong>Concept preview:</strong> a design and content preview prepared for Gorski Law, not the official website. Practice pages and guides are drafts pending attorney review.' : ''}</p>
  </div></div></div>
  <div class="wrap foot__base"><p>© ${BUILD_DATE.slice(0, 4)} Gorski Law. Responsible attorney: Mark S. Gorski.</p><p><a href="#top">Back to top</a></p></div>
</footer>
<div class="dock" id="dock" role="region" aria-label="Call Gorski Law"><a class="dock__btn dock__btn--call" href="${TEL}">${icon('phone')}Call</a><a class="dock__btn dock__btn--quote" href="/contact/">Free consultation</a></div>`;
}

/* ---------------------------------------------------------------- inner-page pieces (template: multi-page sets) */
function crumbsNav(p) {
  const c = crumbsOf(p);
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${c.map((x, i) => (i === c.length - 1 ? `<li><span aria-current="page">${esc(x.label)}</span></li>` : `<li><a href="${x.route}">${esc(x.label)}</a></li>`)).join('')}</ol></nav>`;
}
const bgLayer = () => `<div class="bg" data-src="/assets/topo-light.svg" aria-hidden="true"></div>`;
const DRAFT_PILL = '<p class="demo-pill">Draft — attorney review pending</p>';

function phero(p, { meta = '', ctas = true, draft = false, iconName = 'scale' } = {}) {
  const fm = p.fm;
  const photo = photoFor(p);
  const media = photo
    ? `<figure class="phero__media${photo === 'mark' ? ' phero__media--portrait' : ''}">${img(photo, { sizes: PHERO_SIZES, eager: true, style: `object-position:${IMG[photo].focus}` })}</figure>`
    : `<div class="phero__badge" aria-hidden="true">${icon(fm.icon || iconName)}</div>`;
  return `<section class="phero phero--img" aria-labelledby="page-title">
  ${bgLayer()}
  <div class="wrap phero__in">
    <div class="phero__copy">
      <div class="phero__top">${crumbsNav(p)}${draft ? DRAFT_PILL : ''}</div>
      ${fm.eyebrow ? `<p class="eyebrow">${esc(fm.eyebrow)}</p>` : ''}
      <h1 class="phero__title" id="page-title">${esc(fm.h1 || fm.title)}</h1>
      ${meta}
      ${fm.lede ? `<p class="phero__lede">${inline(fm.lede)}</p>` : ''}
      ${ctas ? `<div class="phero__ctas"><a class="btn btn--accent btn--lg" href="${TEL}">${icon('phone')}Call ${FIRM.phone}</a><a class="btn btn--line btn--lg" href="/contact/">Free consultation${icon('arrow', 'ico btn__arrow')}</a></div>` : ''}
    </div>
    ${media}
  </div>
</section>`;
}
function factsStrip(list) {
  if (!Array.isArray(list) || !list.length) return '';
  return `<section class="stats stats--facts" aria-label="Key facts"><ul class="wrap stats__list">${list.map((f, i) => `<li class="stat reveal" style="--d:${i + 1}"><span class="stat__v">${esc(f.value)}</span><span class="stat__l">${inline(f.label)}</span></li>`).join('')}</ul></section>`;
}
function tocBox(toc) {
  if (!toc || toc.length < 2) return '';
  return `<nav class="toc" aria-label="On this page"><p class="toc__t">On this page</p><ol>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>`;
}
const sidecard = () => `<div class="sidecard"><p class="sidecard__t">Free consultation</p><p class="sidecard__x">Talk through the charge, the deadlines and your options. Monday to Friday, 9 am – 5 pm.</p><a class="btn btn--accent btn--block" href="${TEL}">${icon('phone')}Call ${FIRM.phone}</a><a class="sidecard__tel" href="/contact/">Contact Gorski Law</a></div>`;
function faqBlock(faq, heading = 'Common questions') {
  if (!Array.isArray(faq) || !faq.length) return '';
  return `<section class="block doc__faq" aria-labelledby="faq-h"><h2 class="block__h" id="faq-h">${esc(heading)}</h2><div class="faq__list">${faq.map((q) => `<details class="qa"><summary><span class="qa__q">${esc(q.q)}</span><span class="qa__icon" aria-hidden="true"></span></summary><div class="qa__a"><p>${inline(q.a)}</p></div></details>`).join('')}</div></section>`;
}
function sourcesBlock(sources, updated) {
  if (!Array.isArray(sources) || !sources.length) return '';
  return `<section class="block" aria-labelledby="src-h"><h2 class="block__h" id="src-h">Sources</h2><ol class="sources">${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ol><p class="sources__note">Oregon statutes were checked against the 2025 edition of the Oregon Revised Statutes${updated ? ` on ${fmtDate(isoDate(updated))}` : ''}, and against the 2026 session laws. Laws change; confirm the current law before relying on it.</p></section>`;
}
function authorBox() {
  return `<section class="block" aria-label="About the author"><div class="author"><img class="author__img" src="/assets/img/mark-gorski-440.webp" alt="Mark S. Gorski" width="440" height="640" loading="lazy" decoding="async"><div><p class="author__k">Author</p><p class="author__name"><a href="/about-mark-gorski/">Mark S. Gorski</a></p><p>Oregon criminal defense, DUII and traffic attorney with Gorski Law, representing clients throughout Oregon from a Portland-metro base. Admitted to the Oregon State Bar in 1991 (Bar No. 912881).</p>${DRAFT_PILL}<p style="margin-top:10px">This page was drafted for Mark S. Gorski's review. It has not yet been reviewed or approved by him.</p></div></div></section>`;
}
const callbox = (t = 'Questions about your case?') => `<div class="callbox"><div><p class="callbox__t">${esc(t)}</p><p>Call Gorski Law for a free consultation, Monday to Friday, 9 am – 5 pm.</p></div><a class="btn btn--accent btn--lg" href="${TEL}">${icon('phone')}Call ${FIRM.phone}</a></div>`;

function xcard(route, kicker) {
  const q = byRoute.get(route);
  if (!q) { warn(`link card to missing page ${route}`); return ''; }
  return `<li class="xcard reveal"><span class="xcard__k">${esc(kicker)}</span><a class="xcard__a" href="${route}">${esc(q.fm.h1 || label(q))}</a>${icon('arrow', 'ico xcard__arrow')}</li>`;
}
function related(heading, cards, id = 'rel-h') {
  if (!cards) return '';
  return `<section class="related" aria-labelledby="${id}"><div class="wrap"><h2 class="h2 related__h" id="${id}">${esc(heading)}</h2><ul class="xcards">${cards}</ul></div></section>`;
}
const relatedPosts = (slugs, heading = 'Related guides', id = 'rel-h') => related(heading, (slugs || []).map((s) => { const q = postBySlug.get(s); if (!q) warn(`related post "${s}" does not exist`); return q ? xcard(q.route, 'Guide') : ''; }).join(''), id);
function postCard(q, i) {
  const money = byRoute.get(q.fm.target_money_page);
  const mins = Math.max(1, Math.round(words(q.src) / 230));
  return `<li class="card reveal" style="--d:${(i % 6) + 1}"><p class="card__kicker">${esc(money ? label(money) : 'Guide')}</p><h3 class="card__title"><a href="${q.route}" style="text-decoration:none">${esc(q.fm.h1 || q.fm.title)}</a></h3><p class="card__meta">${mins} min read · Draft, attorney review pending</p><p class="card__text">${esc(q.fm.description)}</p><a class="card__link" href="${q.route}">Read the guide<span class="sr-only">: ${esc(q.fm.h1 || q.fm.title)}</span>${icon('arrow')}</a></li>`;
}
function cta({ title = 'Talk to Mark before you decide anything', text = 'Deadlines in DUII and license cases start the day of the arrest or the ticket. The first consultation is free and tells you where you stand.' } = {}) {
  return `<section class="cta cta--photo" aria-labelledby="cta-title">
  ${img('sunset', { cls: 'cta__img', sizes: '100vw', style: `object-position:${IMG.sunset.focus}` })}
  <div class="wrap cta__in reveal">
    <h2 class="h2 cta__title" id="cta-title">${esc(title)}</h2>
    <p class="cta__text">${esc(text)}</p>
    <div class="cta__actions"><a class="btn btn--accent btn--lg" href="${TEL}">${icon('phone')}Call ${FIRM.phone}</a><a class="btn btn--glass btn--lg" href="/contact/">Free consultation${icon('arrow', 'ico btn__arrow')}</a></div>
  </div>
</section>`;
}

/* ---------------------------------------------------------------- includes for raw-HTML pages */
const SERVICE_CARDS = [
  { route: '/duii-defense/', icon: 'car' },
  { route: '/duii-defense/dmv-implied-consent-hearing/', icon: 'clock' },
  { route: '/duii-defense/diversion/', icon: 'doc' },
  { route: '/traffic-tickets/', icon: 'gauge' },
  { route: '/traffic-tickets/cdl-commercial-drivers/', icon: 'truck' },
  { route: '/criminal-defense/', icon: 'scale' },
];
const INCLUDES = {
  'service-cards'() {
    return `<ul class="cards">${SERVICE_CARDS.map((c, i) => {
      const q = byRoute.get(c.route);
      if (!q) return '';
      return `<li class="card reveal" style="--d:${i + 1}"><span class="card__icon" aria-hidden="true">${icon(c.icon)}</span><h3 class="card__title">${esc(label(q))}</h3><p class="card__text">${esc(q.fm.card || q.fm.description)}</p><a class="card__link" href="${c.route}">Read more<span class="sr-only">: ${esc(label(q))}</span>${icon('arrow')}</a></li>`;
    }).join('')}</ul>`;
  },
  'latest-posts'() { return `<ul class="xcards">${posts.slice(0, 6).map((q) => xcard(q.route, label(byRoute.get(q.fm.target_money_page) || { fm: { crumb: 'Guide' } }))).join('')}</ul>`; },
  'all-posts'() { return `<ul class="cards">${posts.map((q, i) => postCard(q, i)).join('')}</ul>`; },
  hours: () => hoursDL(),
  'contact-form'() {
    const fields = `<div class="field"><label for="f-name">Your name</label><input class="input" id="f-name" name="name" type="text" autocomplete="name"></div>
      <div class="field"><label for="f-phone">Phone</label><input class="input" id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
      <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email"></div>
      <div class="field"><label for="f-type">What is it about?</label><select class="input" id="f-type" name="type"><option value="">Choose one</option><option>DUII arrest or charge</option><option>DMV hearing or license suspension</option><option>Traffic ticket</option><option>CDL or commercial driver ticket</option><option>Criminal charge</option><option>Not sure yet</option></select></div>
      <div class="field field--full"><label for="f-when">Next court date, if you have one</label><input class="input" id="f-when" name="when" type="text"></div>
      <div class="field field--full"><label for="f-msg">Anything we should know before we call you back?</label><textarea class="input" id="f-msg" name="message" rows="3" aria-describedby="f-msg-hint"></textarea><p class="field__hint" id="f-msg-hint">Please don't include case details you would not want in an email.</p></div>`;
    if (PREVIEW) {
      return `<form class="qform" data-preview aria-describedby="form-notice" novalidate>
      <p class="qform__notice" id="form-notice" role="note">${icon('alert')}<span><strong>Preview only — call <a href="${TEL}">${FIRM.phone}</a>.</strong> This form is switched off in the concept preview. Nothing typed here can be sent or stored, so please call instead.</span></p>
      <fieldset disabled><legend class="sr-only">Consultation request (disabled in this preview)</legend>${fields}</fieldset>
      <div class="field--full qform__send"><button class="btn btn--accent btn--lg btn--block" type="submit" disabled>Send request (disabled in preview)</button><p class="qform__fine">${icon('info')}On the live site this form would go to the office. In this preview it is turned off.</p></div>
    </form>`;
    }
    if (!FORM_ACTION) return `<div class="qform"><p class="qform__notice" role="note">${icon('phone')}<span><strong>Call <a href="${TEL}">${FIRM.phone}</a></strong>, Monday to Friday, 9 am – 5 pm.</span></p></div>`;
    return `<form class="qform" action="${esc(FORM_ACTION)}" method="post"><fieldset><legend class="sr-only">Consultation request</legend>${fields}</fieldset><div class="field--full qform__send"><button class="btn btn--accent btn--lg btn--block" type="submit">Send request${icon('arrow', 'ico btn__arrow')}</button><p class="qform__fine">Sending this form does not create an attorney-client relationship. Please don't send confidential details until we have talked.</p></div></form>`;
  },
  cta: () => cta(),
  band: () => cta(),
  get ["practice-cards"]() { return this["service-cards"]; },
  'img:bridge-hero': () => img('bridge', { cls: 'hero__img', sizes: '(max-width: 899px) 100vw, 44vw', eager: true, style: `--focus:${IMG.bridge.focus}` }),
  'img:mark': () => img('mark', { sizes: '(max-width: 999px) 100vw, 40vw', style: `object-position:${IMG.mark.focus}` }),
  'img:trucks': () => img('trucks', { sizes: '(max-width: 999px) 100vw, 50vw', style: `object-position:${IMG.trucks.focus}` }),
  'img:dogs': () => img('dogs', { sizes: '(max-width: 719px) 100vw, 40vw' }),
  'img:sunset': () => img('sunset', { sizes: '(max-width: 719px) 100vw, 20vw' }),
  'bg': () => bgLayer(),
};
function expand(html) {
  return html
    .replace(/<!--\s*include:([a-z0-9:-]+)\s*-->/g, (all, n) => (INCLUDES[n] ? INCLUDES[n]() : (warn(`unknown include ${n}`), '')))
    .replace(/\{\{PHONE\}\}/g, FIRM.phone).replace(/\{\{TEL\}\}/g, TEL).replace(/\{\{ADDRESS\}\}/g, ADDRESS).replace(/\{\{EMAIL\}\}/g, EMAIL)
    .replace(/\{\{icon:([a-z]+)\}\}/g, (_, n) => icon(n));
}

/* ---------------------------------------------------------------- layouts */
function layoutPractice(p) {
  const fm = p.fm;
  const { html, toc } = renderMarkdown(expand(p.src));
  p.toc = toc;
  const kids = childrenOf(p.route);
  const parent = parentRoute(p.route);
  const siblings = parent && parent !== '/' ? childrenOf(parent).filter((k) => k.route !== p.route) : [];
  const more = kids.length
    ? related(`${label(p)}: in more depth`, kids.map((k) => xcard(k.route, label(p))).join(''), 'kids-h')
    : siblings.length ? related(`More on ${label(byRoute.get(parent))}`, [xcard(parent, 'Overview'), ...siblings.map((k) => xcard(k.route, label(byRoute.get(parent))))].join(''), 'kids-h') : '';
  return `${phero(p, { draft: true })}
${factsStrip(fm.key_facts)}
<div class="wrap doc">
  <article class="doc__main">
    ${html}
    ${faqBlock(fm.faq)}
    ${callbox()}
    ${sourcesBlock(fm.sources, fm.updated)}
    ${authorBox()}
  </article>
  <aside class="doc__side">${tocBox(toc)}${sidecard()}</aside>
</div>
${more}
${relatedPosts(fm.related_posts)}
${cta()}`;
}

function layoutPost(p) {
  const fm = p.fm;
  const { html, toc } = renderMarkdown(p.src);
  p.toc = toc;
  const money = byRoute.get(fm.target_money_page);
  if (!money) warn(`${p.route}: target_money_page ${fm.target_money_page} not found`);
  const mins = Math.max(1, Math.round(words(p.src) / 230));
  const meta = `<p class="phero__meta"><span>By <a href="/about-mark-gorski/">Mark S. Gorski</a></span><span>Published <time datetime="${isoDate(fm.date)}">${fmtDate(isoDate(fm.date))}</time></span><span>Updated <time datetime="${isoDate(fm.updated || fm.date)}">${fmtDate(isoDate(fm.updated || fm.date))}</time></span><span>${mins} min read</span></p>`;
  const pp = { ...p, fm: { ...fm, eyebrow: money ? label(money) : 'Guide', lede: '', icon: money?.fm.icon || 'book' } };
  const moneyCards = money ? [xcard(money.route, 'Practice area'), parentRoute(money.route) !== '/' && byRoute.get(parentRoute(money.route)) ? xcard(parentRoute(money.route), 'Practice area') : ''].join('') : '';
  return `${phero(pp, { meta, ctas: false, draft: true })}
<div class="wrap doc doc--post">
  ${fm.tldr ? `<aside class="tldr" aria-label="Short answer"><p class="tldr__k">Short answer</p><p>${inline(fm.tldr)}</p></aside>` : ''}
  <article class="doc__main">
    ${html}
    ${callbox('Talk to a lawyer about your situation')}
    ${sourcesBlock(fm.sources, fm.updated || fm.date)}
    ${authorBox()}
  </article>
  <aside class="doc__side">${tocBox(toc)}${sidecard()}</aside>
</div>
${related('Where Gorski Law can help', moneyCards, 'money-h')}
${relatedPosts(fm.related_posts, 'Keep reading')}
${cta()}`;
}

function layoutPage(p) {
  const fm = p.fm;
  const r = p.isMd ? renderMarkdown(expand(p.src), { sections: true }) : { html: confirmify(expand(p.src)), toc: [] };
  p.toc = r.toc;
  const side = fm.toc === false ? '' : tocBox(r.toc);
  return `${phero(p, { ctas: fm.ctas !== false, draft: !!fm.draft })}
${factsStrip(fm.key_facts)}
<div class="wrap doc${side ? '' : ' doc--solo'}">
  <article class="doc__main">
    ${r.html}
    ${faqBlock(fm.faq, fm.faq_heading || 'Common questions')}
    ${fm.callbox === false ? '' : callbox()}
    ${sourcesBlock(fm.sources, fm.updated)}
    ${fm.author ? authorBox() : ''}
  </article>
  ${side ? `<aside class="doc__side">${side}${sidecard()}</aside>` : ''}
</div>
${relatedPosts(fm.related_posts)}
${fm.band === false ? '' : cta()}`;
}

function layoutRaw(p) {
  return `${p.fm.hero === false ? '' : phero(p, { ctas: p.fm.ctas !== false })}
${factsStrip(p.fm.key_facts)}
${confirmify(expand(p.isMd ? new Marked({ gfm: true }).parse(p.src) : p.src))}
${p.fm.band === false ? '' : cta()}`;
}
const layoutHome = (p) => confirmify(expand(p.src));

const LAYOUTS = { practice: layoutPractice, post: layoutPost, page: layoutPage, raw: layoutRaw, home: layoutHome };

/* ---------------------------------------------------------------- structured data */
const FIRM_ID = abs('/#firm'), MARK_ID = abs('/#mark'), SITE_ID = abs('/#website');
function graph(p, crumbs) {
  const url = abs(p.route);
  const firm = {
    '@type': ['LegalService', 'Attorney'], '@id': FIRM_ID, name: FIRM.name, url: abs('/'), telephone: '+1-503-224-1843',
    description: 'Criminal defense, DUII and traffic defense for clients throughout Oregon, from a Portland-metro base. Mark S. Gorski founded his criminal defense practice in 1991.',
    image: abs('/assets/img/og.jpg'), logo: abs('/assets/img/gorski-logo.png'),
    areaServed: { '@type': 'State', name: 'Oregon' }, foundingDate: String(FIRM.founded),
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', ...FIRM.openingHoursSpec }],
    sameAs: [FIRM.facebook], founder: { '@id': MARK_ID }, employee: { '@id': MARK_ID },
    knowsAbout: ['DUII defense', 'Driving under the influence of intoxicants (Oregon)', 'Implied consent hearings', 'Traffic tickets', 'Commercial driver (CDL) tickets', 'Criminal defense', 'Domestic violence charges', 'Assault charges', 'Theft charges', 'Drug charges'],
  };
  const mark = {
    '@type': 'Person', '@id': MARK_ID, name: FIRM.attorney, alternateName: [FIRM.attorneyFull, FIRM.nickname], jobTitle: 'Attorney',
    worksFor: { '@id': FIRM_ID }, url: abs('/about-mark-gorski/'), telephone: '+1-503-224-1843',
    knowsAbout: ['Criminal defense', 'DUII defense', 'Traffic law'],
    hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'Bar admission', name: 'Oregon State Bar, Bar No. 912881 (admitted 1991)', recognizedBy: { '@type': 'Organization', name: 'Oregon State Bar', url: 'https://www.osbar.org/' } },
  };
  const website = { '@type': 'WebSite', '@id': SITE_ID, url: abs('/'), name: FIRM.name, publisher: { '@id': FIRM_ID }, inLanguage: 'en-US' };
  const nodes = [firm, mark, website];
  const isPost = p.kind === 'post';
  const webpage = { '@type': p.route === '/faq/' ? ['WebPage', 'FAQPage'] : 'WebPage', '@id': url + '#webpage', url, name: p.title, description: p.description, isPartOf: { '@id': SITE_ID }, inLanguage: 'en-US', about: { '@id': FIRM_ID } };
  if (crumbs.length > 1) {
    webpage.breadcrumb = { '@id': url + '#breadcrumb' };
    nodes.push({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: abs(c.route) })) });
  }
  if (p.route === '/faq/' && Array.isArray(p.fm.faq)) {
    webpage.mainEntity = p.fm.faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: stripTags(inline(q.a)).replace(CONFIRM_RE, '') } }));
  }
  nodes.push(webpage);
  if (isPost) {
    nodes.push({
      '@type': 'BlogPosting', '@id': url + '#article', headline: String(p.fm.h1 || p.fm.title).slice(0, 110), description: p.description,
      datePublished: isoDate(p.fm.date), dateModified: isoDate(p.fm.updated || p.fm.date), author: { '@id': MARK_ID }, publisher: { '@id': FIRM_ID },
      mainEntityOfPage: { '@id': url + '#webpage' }, image: abs('/assets/img/og.jpg'), inLanguage: 'en-US',
      keywords: [p.fm.primary_keyword, ...(p.fm.secondary_keywords || [])].filter(Boolean).join(', '), wordCount: words(p.src),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}

/* ---------------------------------------------------------------- page shell */
// styles.css = the template's own stylesheet (editorial skin) + the Gorski Law layer on top
const CSS = fs.readFileSync(path.join(SRC, 'assets/template.css'), 'utf8') + '\n' + fs.readFileSync(path.join(SRC, 'assets/gorski.css'), 'utf8');
const CSS_V = crypto.createHash('md5').update(CSS).digest('hex').slice(0, 8);
// colours sampled from the Gorski Law logo: shield orange, navy lettering
const THEME = ':root { --accent: #fc9024; --accent-ink: #0c2448; --ink: #0c2448; --paper: #f8f5ef; --display: \'Fraunces\'; }';
const JS_V = hash(path.join(SRC, 'assets/app.js'));
function heroPreload(p) {
  const k = p.route === '/' ? 'bridge' : photoFor(p);
  if (!k) return '';
  const sizes = p.route === '/' ? '(max-width: 899px) 100vw, 44vw' : PHERO_SIZES;
  return IMG[k].sizes.length > 1
    ? `<link rel="preload" as="image" href="${imgSrc(k)}" imagesrcset="${imgSet(k)}" imagesizes="${sizes}" fetchpriority="high">`
    : `<link rel="preload" as="image" href="${imgSrc(k)}" fetchpriority="high">`;
}
function shell(p, main) {
  const crumbs = crumbsOf(p);
  const is404 = p.route === '/404.html';
  const robots = PREVIEW || is404 ? '<meta name="robots" content="noindex, nofollow">' : '';
  const url = abs(p.route);
  const ogImg = abs('/assets/img/og.jpg');
  return `<!doctype html>
<html lang="en-US" data-font="Fraunces" data-skin="editorial">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
${robots}
${is404 ? '' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="${p.kind === 'post' ? 'article' : 'website'}">
<meta property="og:site_name" content="Gorski Law">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Gorski Law: Portland DUII, criminal and traffic defense since 1991">
<meta property="og:locale" content="en_US">
${p.kind === 'post' ? `<meta property="article:published_time" content="${isoDate(p.fm.date)}">\n<meta property="article:modified_time" content="${isoDate(p.fm.updated || p.fm.date)}">\n<meta property="article:author" content="${abs('/about-mark-gorski/')}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${ogImg}">
<meta name="theme-color" content="#f8f5ef">
<link rel="icon" href="/favicon.png" type="image/png" sizes="192x192">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${heroPreload(p)}
<link rel="preload" href="/assets/fonts/Fraunces-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css?v=${CSS_V}">
<style>${THEME}</style>
<link rel="alternate" type="application/rss+xml" title="Gorski Law blog" href="/rss.xml">
<script>(function(d){d.classList.add('js');try{if(sessionStorage.getItem('gl-ribbon')==='off')d.classList.add('ribbon-off')}catch(e){}setTimeout(function(){if(!window.glReady)d.classList.remove('js')},4000)})(document.documentElement)</script>
${is404 ? '' : `<script type="application/ld+json">${graph(p, crumbs)}</script>`}
<script src="/assets/app.js?v=${JS_V}" defer></script>
</head>
<body id="top">
${SPRITE}
<a class="skip" href="#main">Skip to content</a>
${confirmify(header(p))}
<main id="main">
${main}
</main>
${confirmify(footer(p))}
</body>
</html>
`;
}

/* ---------------------------------------------------------------- base path + output */
function withBase(html) {
  if (!BASE_PATH) return html;
  return html
    .replace(/(\s(?:href|src|action|poster|data-src)=")\/(?!\/)/g, `$1${BASE_PATH}/`)
    .replace(/(\s(?:srcset|imagesrcset)=")([^"]+)"/g, (_, a, list) => a + list.split(',').map((s) => s.trim().replace(/^\/(?!\/)/, `${BASE_PATH}/`)).join(', ') + '"');
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // assets
  fs.cpSync(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true, filter: (f) => !/(template|gorski)\.css$/.test(f) });
  write('assets/styles.css', CSS);
  for (const f of ['favicon.png', 'favicon-32.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
  write('assets/topo-light.svg', topoSVG({ stroke: '#0c2448', accent: '#fc9024', light: true }));
  write('.nojekyll', '');

  const confirms = [];
  const report = [];
  for (const p of all) {
    const fm = p.fm;
    p.title = String(fm.title || '').trim();
    p.description = String(fm.description || '').trim();
    if (!p.title) warn(`${p.route}: missing title`);
    if (p.title.length > 60) warn(`${p.route}: title is ${p.title.length} chars (max 60)`);
    if (p.route !== '/404.html' && !p.description) warn(`${p.route}: missing description`);
    if (p.description.length > 155) warn(`${p.route}: description is ${p.description.length} chars (max 155)`);
    if (CONFIRM_RE.test(p.title + p.description)) warn(`${p.route}: {{CONFIRM}} inside title/description`);
    CONFIRM_RE.lastIndex = 0;
    const layout = LAYOUTS[fm.layout || (p.isMd ? 'page' : 'raw')];
    if (!layout) { warn(`${p.route}: unknown layout ${fm.layout}`); continue; }
    const html = withBase(shell(p, layout(p)));
    const out = p.route === '/404.html' ? '404.html' : p.route.replace(/^\//, '') + 'index.html';
    write(out, html);
    for (const m of html.matchAll(CONFIRM_RE)) confirms.push({ route: p.route, text: decode(m[1].trim()) });
    report.push({ route: p.route, title: p.title, words: words(p.src), kind: p.kind });
  }

  // duplicates
  const dup = (key) => { const seen = new Map(); for (const p of all) { const v = p[key]; if (!v) continue; if (seen.has(v)) warn(`duplicate ${key}: ${p.route} and ${seen.get(v)}`); else seen.set(v, p.route); } };
  dup('title'); dup('description');

  // sitemap, robots, rss, llms
  const indexable = all.filter((p) => p.route !== '/404.html').sort((a, b) => rank(a.route) - rank(b.route) || a.route.localeCompare(b.route));
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `  <url><loc>${abs(p.route)}</loc><lastmod>${isoDate(p.fm.updated || p.fm.date || BUILD_DATE)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `# ${PREVIEW ? 'Concept preview: every page carries <meta name="robots" content="noindex, nofollow">. No Disallow here on purpose, so crawlers can read that tag.' : 'Gorski Law'}\nUser-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);
  const x = (s) => esc(s).replace(/'/g, '&apos;');
  write('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>Gorski Law blog</title>\n<link>${abs('/blog/')}</link>\n<atom:link href="${abs('/rss.xml')}" rel="self" type="application/rss+xml"/>\n<description>Plain-language guides to Oregon DUII, traffic and criminal law from Gorski Law. Drafts pending attorney review.</description>\n<language>en-us</language>\n<lastBuildDate>${new Date(BUILD_DATE + 'T12:00:00Z').toUTCString()}</lastBuildDate>\n${posts.map((p) => `<item>\n  <title>${x(p.fm.h1 || p.title)}</title>\n  <link>${abs(p.route)}</link>\n  <guid isPermaLink="true">${abs(p.route)}</guid>\n  <pubDate>${new Date(isoDate(p.fm.date) + 'T12:00:00Z').toUTCString()}</pubDate>\n  <description>${x(p.description)}</description>\n</item>`).join('\n')}\n</channel>\n</rss>\n`);
  const L = (r) => { const q = byRoute.get(r); return q ? `- [${q.fm.h1 || q.title}](${abs(r)}): ${q.description}` : ''; };
  write('llms.txt', `# Gorski Law\n\n> Gorski Law is the Oregon criminal defense, DUII and traffic defense practice of attorney Mark S. Gorski (Oregon State Bar No. 912881, admitted 1991). It represents clients throughout Oregon, including eastern and southern Oregon, from a Portland-metro base. Free consultation. Phone ${FIRM.phone}, Monday to Friday 9:00 am to 5:00 pm.\n\n${PREVIEW ? 'Note: this is a concept preview, not the official Gorski Law website. Practice pages and posts are drafts pending attorney review.\n\n' : ''}Gorski Law uses "DUII" (driving under the influence of intoxicants), Oregon's legal term for what most states call DUI. Content is general information about Oregon law, not legal advice.\n\n## Practice areas\n\n${['/duii-defense/', '/traffic-tickets/', '/criminal-defense/'].map((r) => [L(r), ...childrenOf(r).map((k) => '  ' + L(k.route))].join('\n')).join('\n')}\n\n## Key pages\n\n${['/about-mark-gorski/', '/faq/', '/courts-we-serve/', '/contact/', '/blog/'].map(L).filter(Boolean).join('\n')}\n\n## Guides\n\n${posts.map((p) => L(p.route)).join('\n')}\n\n## Contact\n\n- Phone: ${FIRM.phone} (Mon–Fri, 9:00 am – 5:00 pm; closed Sat–Sun)\n- Facebook: ${FIRM.facebook}\n- Office address: not yet published\n`);

  // CONFIRM.md: refresh the auto-collected list between the markers
  const cfile = path.join(ROOT, 'CONFIRM.md');
  if (fs.existsSync(cfile)) {
    const uniq = new Map();
    for (const c of confirms) { if (!uniq.has(c.text)) uniq.set(c.text, new Set()); uniq.get(c.text).add(c.route); }
    const list = [...uniq.entries()].map(([t, rs]) => `- [ ] **${t}** — ${rs.size === all.length ? 'every page (footer)' : [...rs].sort((a, b) => rank(a) - rank(b)).map((r) => `\`${r}\``).join(', ')}`).join('\n');
    const block = `<!-- AUTO:START (written by build.js; do not edit by hand) -->\n${uniq.size} distinct placeholders, ${confirms.length} occurrences across the built pages (${PREVIEW ? 'preview' : 'production'} build of ${BUILD_DATE}).\n\n${list}\n<!-- AUTO:END -->`;
    const cur = fs.readFileSync(cfile, 'utf8');
    if (/<!-- AUTO:START[\s\S]*?<!-- AUTO:END -->/.test(cur)) fs.writeFileSync(cfile, cur.replace(/<!-- AUTO:START[\s\S]*?<!-- AUTO:END -->/, block));
  }
  fs.writeFileSync(path.join(DIST, '..', '.build-report.json'), JSON.stringify({ preview: PREVIEW, site: SITE_URL, base: BASE_PATH, pages: report, confirms: confirms.length, warnings }, null, 2));

  console.log(`Built ${all.length} pages (${posts.length} posts) → dist/  ·  SITE_URL=${SITE_URL}  BASE_PATH=${BASE_PATH || '(none)'}  PREVIEW=${PREVIEW}`);
  console.log(`{{CONFIRM}} placeholders: ${new Set(confirms.map((c) => c.text)).size} distinct, ${confirms.length} occurrences`);
  if (warnings.length) { console.log(`\n${warnings.length} warning(s):`); warnings.forEach((w) => console.log('  - ' + w)); }
}

build();
