#!/usr/bin/env python3
"""Print the current text of Oregon Revised Statutes sections, straight from the official
2025 edition at oregonlegislature.gov (chapter pages are cached in tools/.ors-cache/).

  python3 tools/ors.py 813.410 813.420      # print sections
  python3 tools/ors.py --grep 813 "diversion"  # find lines in a chapter

Use it to check every legal claim before it goes on the site. Cite readers to
https://oregon.public.law/statutes/ors_<section> (same text, one page per section).
"""
import html, os, re, sys, urllib.request

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.ors-cache')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) gorski-law-preview research'}

def chapter(ch):
    os.makedirs(CACHE, exist_ok=True)
    txt = os.path.join(CACHE, f'ors{ch}.p.txt')
    if os.path.exists(txt):
        return open(txt, encoding='utf-8').read()
    raw = os.path.join(CACHE, f'ors{ch}.html')
    if not os.path.exists(raw):
        url = f'https://www.oregonlegislature.gov/bills_laws/ors/ors{int(ch):03d}.html'
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            open(raw, 'wb').write(r.read())
    s = open(raw, encoding='windows-1252', errors='ignore').read()
    s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'</p>', '\n', s, flags=re.I)
    t = html.unescape(re.sub(r'<[^>]+>', '', s))
    t = re.sub(r'[ \xa0]+', ' ', t)
    t = '\n'.join(l.strip() for l in t.split('\n') if l.strip())
    open(txt, 'w', encoding='utf-8').write(t)
    return t

def section(num, maxlines=120):
    lines = chapter(num.split('.')[0]).split('\n')
    hits = [i for i, l in enumerate(lines) if l.startswith(num + ' ')]
    if not hits:
        return f'[ORS {num} not found in the 2025 edition]'
    i = hits[-1]
    out = [lines[i]]
    for l in lines[i + 1:i + maxlines]:
        if re.match(r'^\d{3}\.\d{3,4} [A-Z]', l) or re.match(r'^Note', l) and len(out) > 1 and False:
            break
        out.append(l)
    return '\n'.join(out)

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(1)
    if a[0] == '--grep':
        for l in chapter(a[1]).split('\n'):
            if re.search(a[2], l, re.I):
                print(l[:400]); print('..')
    else:
        for n in a:
            print(section(n)); print('-' * 40)
