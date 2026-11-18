// node tests/test-build.js — no dependencies. Exits 1 on the first failure.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { build, renderBody, checkDates, icsFor, pageText } = require('../build.js');
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
t('pages.json words: links keep their address, headings keep their links, no HTML, no images', () => {
  const problems = [];
  const txt = pageText('# Kiosk\n\n![a](img/x.jpg)\n\n## [Videos](https://y.com/p?list=AbC)\n- [[teamPolicy]]\n@button [Form](files/f.pdf)\n@dates\nplain **b** <i>', {
    links: { teamPolicy: { label: 'Team policy', url: 'https://docs.google.com/x' } }, origin: 'https://o.net', problems, slug: 'k' });
  assert.deepStrictEqual(problems, []);
  assert.match(txt, /^# Kiosk/);
  assert.match(txt, /## Videos \(https:\/\/y\.com\/p\?list=AbC\)/);
  assert.match(txt, /- Team policy \(https:\/\/docs\.google\.com\/x\)/);
  assert.match(txt, /Button: Form \(https:\/\/o\.net\/files\/f\.pdf\)/);
  assert.match(txt, /Important Dates list: https:\/\/o\.net\/dates\//);
  assert.ok(!/img\/x\.jpg|\*\*/.test(txt), txt);
});
t('@team: the banner box, a round photo and name per line, the lines under it; SUNNY reads names and lines', () => {
  const used = [];
  const h = renderBody('@team Rising Sun **Team**\n- Ann Lee | img/ann.jpg\n- Bo Ray | img/bo.jpg\n> Line one\n> **$15K** required', { ...ctx, useAsset: a => used.push(a) });
  assert.match(h, /^<section class="team"><h2 class="team-title">Rising Sun <strong>Team<\/strong><\/h2><div class="team-grid"><figure><img src="img\/ann.jpg" alt="Ann Lee" loading="lazy"><figcaption>Ann Lee<\/figcaption><\/figure><figure>/);
  assert.match(h, /<\/div><p class="team-note">Line one<\/p><p class="team-note"><strong>\$15K<\/strong> required<\/p><\/section>$/);
  assert.deepStrictEqual(used, ['img/ann.jpg', 'img/bo.jpg']);
  assert.throws(() => renderBody('@team T\n- Ann Lee', ctx), /should be "- Name \| img\/picture.jpg"/);
  assert.throws(() => renderBody('@team T\n> only words', ctx), /no photos/);
  assert.throws(() => renderBody('@team T\n- A | img/a.jpg\n> x\n- B | img/b.jpg', ctx), /photo line comes after/);
  const p = [];
  const txt = pageText('@team Rising Sun Team\n- Ann Lee | img/ann.jpg\n> **$15K** required', { links: {}, origin: 'https://o.net', problems: p, slug: 'home' });
  assert.strictEqual(txt, 'Rising Sun Team\n- Ann Lee\n$15K required');
});
t('@team on a real build: its fonts load on that page only, and a missing photo is a build problem', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rse-team-'));
  for (const d of ['content', 'data', 'assets']) fs.cpSync(path.join(__dirname, '..', d), path.join(tmp, d), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'build.js'), path.join(tmp, 'build.js'));
  const home = path.join(tmp, 'content', 'home.md');
  fs.writeFileSync(home, fs.readFileSync(home, 'utf8').replace(/^!\[[^\n]*\n/m, '@team The Team\n- Nobody | img/not-there.jpg\n'));
  const r = require('child_process').spawnSync(process.execPath, ['build.js', '--check'], { cwd: tmp, encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /img\/not-there\.jpg, which is not in assets/);
  fs.writeFileSync(home, fs.readFileSync(home, 'utf8').replace('img/not-there.jpg', 'img/updated.png'));
  const ok = require('child_process').spawnSync(process.execPath, ['build.js'], { cwd: tmp, encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(fs.readFileSync(path.join(tmp, 'docs', 'index.html'), 'utf8'), /family=Forum&family=Kodchasan/);
  assert.ok(!/Kodchasan/.test(fs.readFileSync(path.join(tmp, 'docs', 'dates', 'index.html'), 'utf8')));
  fs.rmSync(tmp, { recursive: true, force: true });
});
t('the real site writes pages.json: every page, home first, each with words and its own address', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rse-test-'));
  build(out);
  const pj = JSON.parse(fs.readFileSync(path.join(out, 'pages.json'), 'utf8'));
  const md = fs.readdirSync(path.join(__dirname, '..', 'content')).filter(f => f.endsWith('.md'));
  assert.strictEqual(pj.pages.length, md.length);
  assert.strictEqual(pj.pages[0].slug, 'home');
  for (const p of pj.pages) {
    assert.ok(p.text.length > 50, p.slug);
    assert.strictEqual(p.url, p.slug === 'home' ? pj.origin + '/' : `${pj.origin}/${p.slug}/`);
    assert.ok(!/<\/?[a-z][^>]*>/i.test(p.text), p.slug + ' has HTML');
  }
  assert.ok(pj.pages.some(p => p.slug === 'kiosk'));
  fs.rmSync(out, { recursive: true, force: true });
});
console.log(`${n} passed`);
