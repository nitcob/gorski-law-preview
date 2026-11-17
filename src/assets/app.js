/* Gorski Law · concept preview. Vanilla JS, no dependencies, no third-party requests.
   Adapted from the Dream Sites shared base: 1 header + menu · 2 anchor scrolling · 3 scroll reveals · 4 phone dock ·
   5 contents highlight · 6 preview ribbon · 7 preview form guard · 8 animated background (after first paint).
   Everything degrades: without JS every page reads, every link works and the form still cannot send. */
(() => {
  'use strict';
  window.glReady = true; // tells the head failsafe that the script is running

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion.matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const store = {
    get(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } },
  };

  /* ---------- 1. Header shadow once scrolled + phone menu ---------- */
  const bar = $('#bar');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      if (bar) bar.classList.toggle('is-stuck', window.scrollY > 40);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuBtn = $('.menu-btn');
  const menu = $('#menu');
  const label = $('.menu-btn__label');
  const setMenu = (open) => {
    if (!menuBtn || !menu) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (label) label.textContent = open ? 'Close' : 'Menu';
  };
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => setMenu(menu.hidden));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth >= 1180 && !menu.hidden) setMenu(false); });
  }
  // Desktop dropdowns: Escape closes an open submenu and returns focus to its parent link.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const item = document.activeElement && document.activeElement.closest('.nav__item');
    if (item) { const top = $('.nav__link', item); if (top) top.focus(); item.classList.add('is-closed'); }
  });
  $$('.nav__item').forEach((item) => {
    item.addEventListener('mouseleave', () => item.classList.remove('is-closed'));
    item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) item.classList.remove('is-closed'); });
  });

  /* ---------- 2. Smooth scrolling only for in-page link clicks ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2 || reduced()) return;
    root.style.scrollBehavior = 'smooth';
    setTimeout(() => { root.style.scrollBehavior = ''; }, 900);
  });

  /* ---------- 3. Scroll reveals ---------- */
  const reveals = $$('.reveal');
  if (reduced() || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
    reveals.forEach((el) => io.observe(el));
  }

  /* ---------- 4. Phone dock: hidden while a form is on screen or the keyboard is up ---------- */
  const dock = $('#dock');
  if (dock) {
    let formVisible = false;
    let typing = false;
    const update = () => dock.classList.toggle('is-hidden', formVisible || typing);
    const forms = $$('form.qform');
    if (forms.length && 'IntersectionObserver' in window) {
      const seen = new Set();
      const fio = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target); });
        formVisible = seen.size > 0;
        update();
      }, { threshold: 0 });
      forms.forEach((f) => fio.observe(f));
    }
    document.addEventListener('focusin', (e) => { typing = !!e.target.closest('input, textarea, select'); update(); });
    document.addEventListener('focusout', () => { typing = false; setTimeout(update, 60); });
  }

  /* ---------- 5. Inner pages: mark the section being read in the "On this page" list ---------- */
  const tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const tio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        tocLinks.forEach((a) => a.removeAttribute('aria-current'));
        const a = byId.get(e.target.id);
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    $$('.doc__sec[id]').forEach((sec) => tio.observe(sec));
  }

  /* ---------- 6. Preview ribbon: dismissible for this browser tab (the head script hides it before paint next time) ---------- */
  const ribbonX = $('.ribbon__x');
  if (ribbonX) {
    ribbonX.addEventListener('click', () => {
      root.classList.add('ribbon-off');
      store.set('gl-ribbon', 'off');
      const skip = $('.skip');
      if (skip) skip.focus();
    });
  }

  /* ---------- 7. Preview form guard: the preview form can never send, even if someone re-enables it ---------- */
  $$('form[data-preview]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = $('.qform__notice', f);
      if (note) { note.setAttribute('tabindex', '-1'); note.focus(); }
    });
  });

  /* ---------- 8. Animated background: starts only after the page has painted and loaded, never for Save-Data.
     Reduced motion gets the same contour lines, standing still. It sits in a fixed-size, absolutely positioned
     layer, so it can't shift the layout, and only transform/opacity animate (compositor work, no main thread). ---------- */
  const bgs = $$('.bg[data-src]');
  if (bgs.length) {
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const start = () => {
      if (saveData) return;
      // Inlined as <svg> rather than an <img>: line art is not content, and an inline SVG is never counted as
      // the page's largest contentful paint (an <img> fading in after load would be).
      const cache = {};
      bgs.forEach((bg) => {
        const src = bg.dataset.src;
        cache[src] = cache[src] || fetch(src).then((r) => (r.ok ? r.text() : Promise.reject(r.status)));
        cache[src].then((svg) => {
          const layer = document.createElement('div');
          layer.className = 'bg__topo';
          layer.innerHTML = svg;
          bg.appendChild(layer);
          requestAnimationFrame(() => {
            layer.classList.add('is-on');
            if (!reduced()) bg.classList.add('is-live');
          });
        }).catch(() => { /* no background: the page is complete without it */ });
      });
    };
    const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(start, { timeout: 3000 }) : setTimeout(start, 600));
    if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });
    const onMotion = () => bgs.forEach((bg) => bg.classList.toggle('is-live', !reduced() && !!$('.bg__topo', bg)));
    if (motion.addEventListener) motion.addEventListener('change', onMotion);
    // Pause the drift while the tab is hidden.
    document.addEventListener('visibilitychange', () => {
      bgs.forEach((bg) => { bg.style.animationPlayState = document.hidden ? 'paused' : ''; $$('.bg__topo', bg).forEach((i) => { i.style.animationPlayState = document.hidden ? 'paused' : ''; }); });
    });
  }
})();
