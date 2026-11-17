// node tests/test-build.js — no dependencies. Exits 1 on the first failure.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { build, renderBody, checkDates, icsFor } = require('../build.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const ctx = { asset: r => r, useAsset() {}, linkHtml: id => `<a href="L:${id}">${id}</a>`, aHtml: (l, u) => `<a href="${u}">${l}</a>`,
  button: s => `<a class="btn">${s}</a>`, embedUrl: u => u, datesHtml: () => '<ul class="events"></ul>' };

t('headings, lists, nested lists, bold, links', () => {
  const h = renderBody('# Title\n\n- one **b**\n  - sub [x](https://e.com)\n- two\n\nplain *i*', ctx);
  assert.match(h, /<h1>Title<\/h1>/);
  assert.match(h, /<li>one <strong>b<\/strong><ul><li>sub <a href="https:\/\/e.com">x<\/a><\/li><\/ul><\/li><li>two<\/li>/);
  assert.match(h, /<p>plain <em>i<\/em><\/p>/);
});
t('text is escaped, link URLs are not mangled by bold/italic', () => {
  const h = renderBody('a <b> & [x](https://e.com/a_b*c*)', ctx);
  assert.match(h, /a &lt;b&gt; &amp; <a href="https:\/\/e.com\/a_b\*c\*">x<\/a>/);
});
t('[[id]] links come from links.json', () => assert.match(renderBody('- [[teamPolicy]]', ctx), /L:teamPolicy/));
t('dates: bad date, bad time, end before start, duplicate id are each named', () => {
  const p = [];
  checkDates({ events: [
    { id: 'a', title: 'A', date: '2027-13-01' },
    { id: 'a', title: 'B', date: '2027-01-02', start: '9:00' },
    { id: 'c', title: 'C', date: '2027-01-02', start: '10:00', end: '09:00' },
  ] }, p);
  assert.ok(p.some(x => /not YYYY-MM-DD/.test(x)), p.join('\n'));
  assert.ok(p.some(x => /used twice/.test(x)));
  assert.ok(p.some(x => /not HH:MM/.test(x)));
  assert.ok(p.some(x => /ends \(09:00\) before it starts/.test(x)));
});
t('ics: Arizona times become UTC (+7h, no daylight saving)', () => {
  const s = icsFor({ events: [{ id: 'x', title: 'Mtg', date: '2027-07-01', start: '18:00', end: '21:00', place: 'Mesa, AZ' }] }, 'd');
  assert.match(s, /DTSTART:20270702T010000Z/);
  assert.match(s, /LOCATION:Mesa\\, AZ/);
});
t('the real site builds with no problems, and keeps every old address', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rse-test-'));
  const r = build(out);
  assert.deepStrictEqual(r.problems, []);
  for (const o of ['new-page-2', 'new-page-45', 'new-events', 'scripts-videos', 'pricing-services', 'financial-resources'])
    assert.ok(fs.existsSync(path.join(out, o, 'index.html')), o);
  assert.match(fs.readFileSync(path.join(out, '404.html'), 'utf8'), /new-events/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, 'dates.json'), 'utf8')).events.length >= 1);
  fs.rmSync(out, { recursive: true, force: true });
});
console.log(`${n} passed`);
