// Strict overlap measurement for the docked WorkBot tab (F06-A), shared by the repro and acceptance runs.
// Returns, for the current viewport: every visible control or text line whose rectangle intersects the
// tab's rectangle, and every sampled point inside the tab where a pointer would hit the tab while a
// control or text lies underneath it.
export const measureTab = () => {
  const tab = document.querySelector('.workbot-tab');
  if (!tab || tab.hidden || getComputedStyle(tab).display === 'none') return { shown: false, overlaps: [], hits: [] };
  const t = tab.getBoundingClientRect();
  const vis = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  const overlaps = [];
  const CTRL = 'a[href], button, input, textarea, select, summary, [role=tab], [role=button], [role=radio], [tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(CTRL)) {
    if (el.closest('.workbot, .workbot-tab, .workbot-launcher, .workbot-hide')) continue;
    // only what is actually painted and not clipped away by a scroller
    for (const r of el.getClientRects()) if (vis(r) && inter(r, t)) {
      const cx = Math.min(Math.max(t.left + 2, r.left + 1), t.right - 2), cy = Math.min(Math.max(t.top + 2, r.top + 1), t.bottom - 2);
      const under = document.elementsFromPoint(cx, cy).filter((e) => !e.closest('.workbot-tab'))[0];
      if (under && (under === el || el.contains(under) || under.contains(el))) overlaps.push('CTRL ' + (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40));
    }
  }
  const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (vis(r) && inter(r, t)) {
      const cx = Math.min(Math.max(t.left + 1, r.left + 1), t.right - 1), cy = Math.min(Math.max(t.top + 1, r.top + 1), t.bottom - 1);
      const under = document.elementsFromPoint(cx, cy).filter((e) => !e.closest('.workbot-tab'))[0];
      // painted text, not text clipped away inside a scroller
      if (under && (under === n.parentElement || n.parentElement.contains(under) || under.contains(n.parentElement))) overlaps.push('TEXT ' + n.textContent.trim().slice(0, 40));
    }
  }
  // pointer hit testing: every 3px inside the tab, the tab is on top; is anything interactive or text below?
  const hits = [];
  for (let x = t.left + 1; x < t.right; x += 3) for (let y = t.top + 1; y < t.bottom; y += 3) {
    const stack = document.elementsFromPoint(x, y);
    if (!stack[0]?.closest('.workbot-tab')) continue;
    const below = stack.find((e) => !e.closest('.workbot-tab'));
    const ctrl = below?.closest(CTRL);
    if (ctrl && !ctrl.closest('.workbot')) hits.push('CTRL ' + (ctrl.textContent || ctrl.tagName).trim().slice(0, 30));
  }
  return { shown: true, rect: { x: Math.round(t.left), y: Math.round(t.top), w: Math.round(t.width), h: Math.round(t.height) }, overlaps: [...new Set(overlaps)], hits: [...new Set(hits)] };
};
