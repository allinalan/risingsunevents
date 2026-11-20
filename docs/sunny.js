/* SUNNY on the website: the little sun in the corner of every page (Alan, 2026-11-19, "all defaults").
   Tap it, ask where something is, get a short answer and the links. It asks SUNNY's website helper
   (sunny-bot api/site-chat.js), which knows only what this website says; personal questions get "Open SUNNY".
   The conversation lasts while the tab is open (sessionStorage), so tapping a link to another page keeps it.
   Nothing here stores a name; the helper keeps the question and the page, no name and no address. */
(function () {
  'use strict';
  var me = document.currentScript;
  var ENDPOINT = (me && me.getAttribute('data-endpoint')) || 'https://sunny-rsd.vercel.app/api/site-chat';
  var KEY = 'sunny-site-chat';
  var QUICK = [
    { label: 'Submit my stats', ask: 'Where do I submit my event stats?' },
    { label: 'Next meeting', ask: 'When is the next team meeting?' },
    { label: 'Shift Board', ask: 'Where is the Show Shift Board?' },
    { label: 'Add SUNNY to my phone', ask: 'How do I add SUNNY to my phone?' }
  ];
  var SUN = '<svg viewBox="0 0 512 512" aria-hidden="true"><g transform="translate(256 256)"><circle r="78" fill="#F59E0B"/><path d="M118 0L162 0M83.4 83.4L114.6 114.6M0 118L0 162M-83.4 83.4L-114.6 114.6M-118 0L-162 0M-83.4 -83.4L-114.6 -114.6M0 -118L0 -162M83.4 -83.4L114.6 -114.6" stroke="#F59E0B" stroke-width="30" stroke-linecap="round"/></g></svg>';
  var page = ((document.body.className.match(/\bpage-([a-z0-9-]+)/) || [])[1]) || 'home';

  var state = { open: false, turns: [], busy: false };
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.turns)) state = { open: !!saved.open, turns: saved.turns.slice(-20), busy: false }; } catch (e) { /* private window: start fresh */ }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ open: state.open, turns: state.turns.slice(-20) })); } catch (e) { /* fine */ } }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  var btn = el('button', 'sunny-fab');
  btn.type = 'button'; btn.setAttribute('aria-label', 'Ask SUNNY where something is on this website'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = SUN;
  var panel = el('section', 'sunny-panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ask SUNNY'); panel.hidden = true;
  var head = el('div', 'sunny-head');
  var badge = el('span', 'sunny-badge'); badge.innerHTML = SUN;
  var title = el('div', 'sunny-title'); title.appendChild(el('strong', null, 'SUNNY')); title.appendChild(el('span', null, 'Find anything on this website'));
  var close = el('button', 'sunny-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
  head.appendChild(badge); head.appendChild(title); head.appendChild(close);
  var log = el('div', 'sunny-log'); log.setAttribute('aria-live', 'polite');
  var chips = el('div', 'sunny-chips');
  var form = el('form', 'sunny-form');
  var input = el('input'); input.type = 'text'; input.maxLength = 500; input.placeholder = 'Ask where something is…'; input.setAttribute('aria-label', 'Your question'); input.autocomplete = 'off';
  var send = el('button', 'sunny-send', 'Ask'); send.type = 'submit';
  form.appendChild(input); form.appendChild(send);
  var foot = el('p', 'sunny-foot', 'Answers come from this website. Please don\'t type personal details.');
  panel.appendChild(head); panel.appendChild(log); panel.appendChild(chips); panel.appendChild(form); panel.appendChild(foot);
  document.body.appendChild(panel); document.body.appendChild(btn);

  function link(l) {
    var a = el('a', 'sunny-link', l.label);
    var u; try { u = new URL(l.url, location.href); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    a.href = u.href;
    if (u.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }
  function bubble(turn) {
    var b = el('div', 'sunny-msg ' + (turn.role === 'user' ? 'sunny-me' : 'sunny-bot'));
    b.appendChild(el('p', null, turn.text));
    if (turn.links && turn.links.length) {
      var row = el('div', 'sunny-links');
      turn.links.forEach(function (l) { var a = link(l); if (a) row.appendChild(a); });
      b.appendChild(row);
    }
    return b;
  }
  function render() {
    log.innerHTML = '';
    log.appendChild(bubble({ role: 'assistant', text: 'Hi! I\'m SUNNY. Ask me where anything is on the team website, or tap one of these.' }));
    state.turns.forEach(function (t) { log.appendChild(bubble(t)); });
    if (state.busy) { var d = el('div', 'sunny-msg sunny-bot sunny-typing'); d.setAttribute('aria-label', 'SUNNY is answering'); d.innerHTML = '<span></span><span></span><span></span>'; log.appendChild(d); }
    chips.innerHTML = '';
    if (!state.turns.length) QUICK.forEach(function (q) { var c = el('button', 'sunny-chip', q.label); c.type = 'button'; c.onclick = function () { ask(q.ask); }; chips.appendChild(c); });
    chips.hidden = !!state.turns.length;
    send.disabled = state.busy;
    log.scrollTop = log.scrollHeight;
  }
  function show(open) {
    state.open = open; save();
    panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('sunny-on', open);
    if (open) { render(); setTimeout(function () { input.focus(); }, 30); }
  }
  function ask(q) {
    q = String(q || '').trim();
    if (!q || state.busy) return;
    var history = state.turns.slice(-6).map(function (t) { return { role: t.role, text: t.text }; });
    state.turns.push({ role: 'user', text: q }); state.busy = true; input.value = ''; save(); render();
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, history: history, page: page }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        state.turns.push({ role: 'assistant', text: j.answer || 'I couldn\'t answer that just now. The menu at the top has every page.', links: Array.isArray(j.links) ? j.links : [] });
      })
      .catch(function () {
        state.turns.push({ role: 'assistant', text: 'I can\'t reach my answers right now. The menu at the top has every page.', links: [] });
      })
      .then(function () { clearTimeout(timer); state.busy = false; save(); render(); });
  }

  btn.onclick = function () { show(panel.hidden); };
  close.onclick = function () { show(false); btn.focus(); };
  form.onsubmit = function (e) { e.preventDefault(); ask(input.value); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { show(false); btn.focus(); } });
  if (state.open) show(true);
})();
