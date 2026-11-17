// Writes keyword-map.csv from the pages' and posts' front matter plus the planned (brief / blocked) rows.
//   node tools/keyword-map.js
// Columns: keyword, cluster, intent, priority, target_url, status. Priorities come from the original keyword
// brief (P1–P3); keywords added during the build are marked "added".
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const PRIORITY = {
  'portland dui lawyer': 'P1', 'portland duii lawyer': 'P1', 'dui attorney portland oregon': 'P1', 'oregon dui lawyer': 'P1', 'duii attorney oregon': 'P1',
  'oregon duii diversion': 'P1', 'duii diversion program oregon': 'P1', 'do i qualify for duii diversion': 'P1',
  'oregon implied consent hearing': 'P1', 'dui license suspension oregon': 'P1', 'request dmv hearing after dui oregon': 'P1',
  'refused breath test oregon': 'P2', 'breath test refusal penalty oregon': 'P2', 'marijuana dui oregon': 'P2', 'drug duii oregon': 'P2', 'dui prescription drugs oregon': 'P2',
  'second dui oregon': 'P2', 'third dui oregon felony': 'P2', 'felony duii oregon': 'P2', 'ignition interlock oregon': 'P3', 'hardship permit oregon dui': 'P3',
  'traffic ticket lawyer oregon': 'P1', 'speeding ticket lawyer portland': 'P1', 'traffic attorney portland': 'P1',
  'cdl ticket lawyer oregon': 'P1', 'commercial driver ticket oregon': 'P1', 'cdl speeding ticket oregon': 'P1',
  'fight speeding ticket oregon': 'P2', 'is it worth fighting a speeding ticket in oregon': 'P2', 'driving while suspended oregon': 'P2', 'dws oregon misdemeanor': 'P2',
  'reckless driving oregon': 'P2', 'careless driving oregon': 'P2', 'oregon traffic violation classes fines': 'P3', 'portland speed camera ticket': 'P3', 'out of state ticket oregon': 'P3',
  'portland criminal defense attorney': 'P1', 'criminal defense lawyer portland oregon': 'P1', 'oregon criminal defense lawyer': 'P1',
  'domestic violence lawyer portland': 'P2', 'assault iv oregon': 'P2', 'assault charge lawyer oregon': 'P2', 'theft charge lawyer oregon': 'P2', 'shoplifting lawyer portland': 'P2',
  'drug possession lawyer oregon': 'P2', 'misdemeanor vs felony oregon': 'P3', 'set aside conviction oregon': 'P3',
  'gorski law': 'brand', 'mark gorski attorney': 'brand', 'mark gorski lawyer portland': 'brand',
  'multnomah county dui lawyer': 'local', 'washington county dui lawyer hillsboro': 'local', 'clackamas county dui lawyer oregon city': 'local',
};
const cluster = (r) => (r.startsWith('/duii-defense/') ? 'DUII' : r.startsWith('/traffic-tickets/') ? 'Traffic' : r.startsWith('/criminal-defense/') ? 'Criminal' : r === '/' || r.startsWith('/about') ? 'Brand' : 'Site');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rows = [];
const seen = new Set();
const add = (keyword, clusterName, intent, target, status) => {
  const k = keyword.toLowerCase();
  if (seen.has(k)) throw new Error(`keyword used twice: ${k}`);
  seen.add(k);
  rows.push([k, clusterName, intent, PRIORITY[k] || 'added', target, status]);
};
const items = [];
for (const f of walk('src/pages').filter((x) => /\.(md|html)$/.test(x))) {
  const rel = f.replace(/^src\/pages\//, '').replace(/\.(md|html)$/, '');
  const route = rel === 'index' ? '/' : '/' + rel.replace(/\/?index$/, '') + '/';
  items.push({ route, data: matter(fs.readFileSync(f, 'utf8')).data, post: false });
}
for (const f of walk('src/posts').filter((x) => x.endsWith('.md'))) items.push({ route: `/blog/${path.basename(f, '.md')}/`, data: matter(fs.readFileSync(f, 'utf8')).data, post: true });
const ORDER = ['/', '/duii-defense/', '/traffic-tickets/', '/criminal-defense/'];
items.sort((a, b) => (a.post - b.post) || (ORDER.indexOf(a.route) + 1 || 99) - (ORDER.indexOf(b.route) + 1 || 99) || a.route.localeCompare(b.route));
for (const { route, data, post } of items) {
  if (!data.primary_keyword) continue;
  const c = post ? cluster(data.target_money_page || '') : cluster(route);
  const money = ['/duii-defense/', '/traffic-tickets/', '/criminal-defense/'].includes(route);
  const intent = post ? 'informational' : route === '/' || route.startsWith('/about') || route === '/contact/' ? 'navigational' : money ? 'commercial (hire a lawyer)' : route.split('/').length > 3 ? 'commercial + informational' : 'informational';
  add(data.primary_keyword, c, intent, route, post ? 'drafted: primary (post)' : 'built: primary');
  for (const k of data.secondary_keywords || []) add(k, c, intent, route, post ? 'drafted: secondary (post)' : 'built: secondary');
}
// briefs (content-calendar.md, posts 13–24) and blocked pages
const cal = fs.readFileSync('content-calendar.md', 'utf8');
for (const m of cal.matchAll(/### (\d+)\. ([^\n]+)[\s\S]*?\*\*Target keyword:\*\* ([^\n]+)/g)) {
  const kw = m[3].trim();
  const blocked = /CONFIRM/.test(cal.split(`### ${m[1]}. `)[1].split('\n### ')[0]) ? 'brief (needs CONFIRM)' : 'brief';
  add(kw, /dui|duii|interlock|hardship/i.test(kw) ? 'DUII' : /ticket|driving|camera/i.test(kw) ? 'Traffic' : 'Criminal', 'informational', `/blog/ (post ${m[1]}: ${m[2].trim()})`, `${blocked}: content-calendar.md #${m[1]}`);
}
add('multnomah county dui lawyer', 'Local', 'commercial (hire a lawyer)', '/courts-we-serve/multnomah-county/ (not built)', 'blocked: CONFIRM counties');
add('washington county dui lawyer hillsboro', 'Local', 'commercial (hire a lawyer)', '/courts-we-serve/washington-county/ (not built)', 'blocked: CONFIRM counties');
add('clackamas county dui lawyer oregon city', 'Local', 'commercial (hire a lawyer)', '/courts-we-serve/clackamas-county/ (not built)', 'blocked: CONFIRM counties');
const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
fs.writeFileSync('keyword-map.csv', ['keyword,cluster,intent,priority,target_url,status', ...rows.map((r) => r.map(csv).join(','))].join('\n') + '\n');
console.log(`keyword-map.csv: ${rows.length} keywords, ${rows.filter((r) => r[5].includes('primary')).length} primaries, all unique`);
