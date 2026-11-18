#!/usr/bin/env node
// Builds www.risingsunevents.net from content/*.md + data/*.json into docs/ (GitHub Pages serves docs/).
// No dependencies. `node build.js` builds; `node build.js --check` builds into a temp folder and fails loudly
// (exit 1, one line per problem) on anything that would publish a broken page. The webmaster
// (rsd-shift-picking webmaster.js) runs --check before every publish and refuses on any problem.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const TZ_OFFSET = '-07:00'; // Arizona: no daylight saving, ever.

function readJson(rel) {
  const p = path.join(ROOT, rel);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`${rel}: ${e.message}`); }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- content ----------
function parsePage(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)}: no front matter (--- title/nav/old ---)`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.title) throw new Error(`${path.basename(file)}: front matter has no title`);
  meta.old = (meta.old || '').split(',').map(s => s.trim()).filter(Boolean);
  return { slug: path.basename(file, '.md'), meta, body: m[2] };
}

function makeInline(ctx) {
  return function inline(text) {
    // Pull links out first so their URLs are never touched by bold/italic.
    const parts = [];
    const keep = html => { parts.push(html); return `\u0000${parts.length - 1}\u0000`; };
    let s = text.replace(/\[\[([A-Za-z0-9_-]+)\]\]/g, (_, id) => keep(ctx.linkHtml(id)));
    s = s.replace(/\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)\s]+)\)/g, (_, label, url) => keep(ctx.aHtml(label, url)));
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[Number(i)]);
  };
}

function renderBody(body, ctx) {
  const inline = makeInline(ctx);
  const lines = body.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const blank = l => !l || !l.trim();
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue;
    }
    if (line.trim() === '---') { out.push('<hr>'); i++; continue; }
    if ((m = line.match(/^@button\s+(.*)$/))) {
      out.push(`<p class="btn-row">${ctx.button(m[1].trim())}</p>`); i++; continue;
    }
    if ((m = line.match(/^@embed\s+(\S+)$/))) {
      out.push(`<div class="embed"><iframe src="${esc(ctx.embedUrl(m[1]))}" title="Video" loading="lazy" allowfullscreen></iframe></div>`); i++; continue;
    }
    if (line.trim() === '@dates') { out.push(ctx.datesHtml(false)); i++; continue; }
    if (line.trim() === '@people' || line.trim() === '@gallery') {
      const kind = line.trim().slice(1); i++;
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2).trim()); i++; }
      if (kind === 'people') {
        out.push('<div class="people">' + items.map(it => {
          const [cap, img] = it.split('|').map(s => s.trim());
          ctx.useAsset(img);
          return `<figure><img src="${esc(ctx.asset(img))}" alt="${esc(cap.split(' - ')[0])}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
        }).join('') + '</div>');
      } else {
        out.push('<div class="gallery">' + items.map(img => {
          ctx.useAsset(img);
          return `<a href="${esc(ctx.asset(img))}"><img src="${esc(ctx.asset(img))}" alt="" loading="lazy"></a>`;
        }).join('') + '</div>');
      }
      continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      ctx.useAsset(m[2]);
      out.push(`<figure class="pic"><img src="${esc(ctx.asset(m[2]))}" alt="${esc(m[1])}" loading="lazy"></figure>`); i++; continue;
    }
    if (/^- /.test(line)) {
      let html = '<ul>';
      let open = false;
      while (i < lines.length && /^(- |  - )/.test(lines[i])) {
        const l = lines[i];
        if (l.startsWith('  - ')) {
          if (!open) { html = html.replace(/<\/li>$/, ''); html += '<ul>'; open = true; }
          html += `<li>${inline(l.slice(4))}</li>`;
        } else {
          if (open) { html += '</ul></li>'; open = false; }
          html += `<li>${inline(l.slice(2))}</li>`;
        }
        i++;
      }
      if (open) html += '</ul></li>';
      out.push(html + '</ul>');
      continue;
    }
    const para = [];
    while (i < lines.length && !blank(lines[i]) && !/^(#{1,4}\s|@|- |!\[|---$)/.test(lines[i])) { para.push(inline(lines[i].trim())); i++; }
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    else { throw new Error(`cannot read line: ${line}`); }
  }
  return out.join('\n');
}

// ---------- pages.json: every page as plain text, for SUNNY ----------
// SUNNY (sunny-bot lib/live-sources.js, source "site") reads https://www.risingsunevents.net/pages.json so it can answer
// from the whole site. Plain words and links only: no images, no HTML. A link is "label (url)"; a page on this site is
// its full address. Built from the same markdown as the pages, so the two never disagree.
function pageText(body, { links, origin, problems, slug }) {
  const abs = url => (/^(https?:|mailto:|tel:)/i.test(url) ? url : url.startsWith('//') ? 'https:' + url : `${origin}/${url.replace(/^\.?\//, '')}`);
  const linkOf = id => { const l = links[id]; if (!l) { problems.push(`content/${slug}.md: [[${id}]] is not in data/links.json`); return id; } return `${l.label} (${l.url})`; };
  const inline = t => t
    .replace(/\[\[([A-Za-z0-9_-]+)\]\]/g, (_, id) => linkOf(id))
    .replace(/\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)\s]+)\)/g, (_, label, url) => `${label.replace(/\*/g, '')} (${abs(url)})`)
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
  const out = [];
  const lines = body.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (!line.trim() || line.trim() === '---' || /^!\[[^\]]*\]\([^)\s]+\)$/.test(line)) continue;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { out.push('', '#'.repeat(m[1].length) + ' ' + inline(m[2])); continue; }
    if ((m = line.match(/^@button\s+(.*)$/))) { out.push('Button: ' + inline(m[1].trim())); continue; }
    if ((m = line.match(/^@embed\s+(\S+)$/))) { out.push('Video: ' + abs(m[1])); continue; }
    if (line.trim() === '@dates') { out.push(`(The Important Dates list: ${origin}/dates/)`); continue; }
    if (line.trim() === '@people' || line.trim() === '@gallery') {
      const people = line.trim() === '@people';
      while (i + 1 < lines.length && /^- /.test(lines[i + 1])) { i++; if (people) out.push('- ' + lines[i].slice(2).split('|')[0].trim()); }
      continue;
    }
    if (/^ {2}- /.test(line)) { out.push('  - ' + inline(line.slice(4))); continue; }
    if (/^- /.test(line)) { out.push('- ' + inline(line.slice(2))); continue; }
    out.push(inline(line.trim()));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- dates ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkDates(dates, problems) {
  if (!dates || !Array.isArray(dates.events)) { problems.push('data/dates.json: no "events" list'); return; }
  const ids = new Set();
  dates.events.forEach((e, n) => {
    const where = `data/dates.json event ${n + 1} (${e.title || 'no title'})`;
    if (!e.id) problems.push(`${where}: no id`);
    else if (ids.has(e.id)) problems.push(`${where}: id ${e.id} is used twice`);
    ids.add(e.id);
    if (!e.title || !String(e.title).trim()) problems.push(`${where}: no title`);
    if (!DATE_RE.test(e.date || '') || isNaN(Date.parse(e.date + 'T12:00:00' + TZ_OFFSET))) problems.push(`${where}: date "${e.date}" is not YYYY-MM-DD`);
    if (e.start && !TIME_RE.test(e.start)) problems.push(`${where}: start "${e.start}" is not HH:MM`);
    if (e.end && !TIME_RE.test(e.end)) problems.push(`${where}: end "${e.end}" is not HH:MM`);
    if (e.end && !e.start) problems.push(`${where}: has an end time but no start time`);
    if (e.start && e.end && e.end <= e.start) problems.push(`${where}: ends (${e.end}) before it starts (${e.start})`);
  });
}

function fmtTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
}
function fmtDay(d) {
  const dt = new Date(d + 'T12:00:00' + TZ_OFFSET);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' });
}
function endMs(e) {
  return Date.parse(`${e.date}T${e.end || e.start || '23:59'}:00${TZ_OFFSET}`);
}
function sortEvents(list) {
  return [...list].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
}

function eventHtml(e) {
  const when = e.start ? `${fmtTime(e.start)}${e.end ? ' – ' + fmtTime(e.end) : ''}` : 'All day';
  const map = e.place ? ` <a class="map" href="https://maps.google.com/?q=${encodeURIComponent(e.place)}" target="_blank" rel="noopener">Map</a>` : '';
  return `<li class="event" data-end="${endMs(e)}"><div class="day">${esc(fmtDay(e.date))}</div>` +
    `<div class="what">${esc(e.title.trim())}</div><div class="when">${esc(when)}</div>` +
    (e.place ? `<div class="where">${esc(e.place)}${map}</div>` : '') +
    (e.note ? `<div class="note">${esc(e.note)}</div>` : '') + '</li>';
}

function icsFor(dates, domain) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const fold = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rising Sun Division//Important Dates//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:RSD Important Dates', 'X-WR-TIMEZONE:America/Phoenix', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H'];
  for (const e of sortEvents(dates.events)) {
    const d = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@${domain}`, `DTSTAMP:${stamp}`);
    if (e.start) {
      const toUtc = t => new Date(`${e.date}T${t}:00${TZ_OFFSET}`).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      lines.push(`DTSTART:${toUtc(e.start)}`, `DTEND:${toUtc(e.end || addHour(e.start))}`);
    } else {
      const next = new Date(Date.parse(e.date + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`);
    }
    lines.push(`SUMMARY:${fold(e.title.trim())}`);
    if (e.place) lines.push(`LOCATION:${fold(e.place)}`);
    if (e.note) lines.push(`DESCRIPTION:${fold(e.note)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
function addHour(t) { const [h, m] = t.split(':').map(Number); return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

// ---------- page shell ----------

function shell({ title, description, base, navHtml, main, slug, site, canonical }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title === site.title ? site.title : `${title} — ${site.title}`)}</title>
<meta name="description" content="${esc(description || `${title} — ${site.title} ${site.tagline}`)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:site_name" content="${esc(site.title)} ${esc(site.tagline)}">
<meta property="og:image" content="https://${esc(site.domain)}/img/updated.png">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${base}site.css">
</head>
<body class="page-${esc(slug)}">
<header class="site-header">
  <a class="brand" href="${base}">${esc(site.title)}<span>${esc(site.tagline)}</span></a>
  <button class="menu-btn" aria-expanded="false" aria-controls="nav" onclick="var n=document.getElementById('nav');var o=n.classList.toggle('open');this.setAttribute('aria-expanded',o)">Menu</button>
  <nav id="nav">${navHtml}</nav>
</header>
<main>
${main}
</main>
<footer class="site-footer">${esc(site.footer)} · <a href="${base}dates/">Important Dates</a> · <a href="${base}dates.ics">Add the dates to your calendar</a></footer>
</body>
</html>
`;
}

function redirectPage(to, canonical) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Moved</title>
<link rel="canonical" href="${esc(canonical)}"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${esc(to)}"><script>location.replace(${JSON.stringify(to)}+location.hash)</script>
</head><body><p>This page moved to <a href="${esc(to)}">${esc(canonical)}</a>.</p></body></html>
`;
}

// ---------- build ----------
function build(outDir) {
  const problems = [];
  const site = readJson('data/site.json');
  const links = readJson('data/links.json');
  const dates = readJson('data/dates.json');
  checkDates(dates, problems);
  for (const [id, l] of Object.entries(links)) {
    if (id.startsWith('_')) continue;
    if (!l || !l.label || !l.url) problems.push(`data/links.json ${id}: needs a label and a url`);
    else if (!/^https?:\/\//.test(l.url)) problems.push(`data/links.json ${id}: url "${l.url}" does not start with https://`);
  }

  const files = fs.readdirSync(path.join(ROOT, 'content')).filter(f => f.endsWith('.md')).sort();
  const pages = files.map(f => parsePage(path.join(ROOT, 'content', f)));
  const bySlug = Object.fromEntries(pages.map(p => [p.slug, p]));
  if (!bySlug.home) problems.push('content/home.md is missing');
  for (const s of site.nav) if (!bySlug[s]) problems.push(`data/site.json nav names "${s}" but content/${s}.md does not exist`);

  const oldSeen = {};
  for (const p of pages) for (const o of p.meta.old) {
    if (!/^\/[a-z0-9-]+$/.test(o)) problems.push(`content/${p.slug}.md: old address "${o}" must look like /some-page`);
    if (oldSeen[o]) problems.push(`old address ${o} is claimed by both ${oldSeen[o]} and ${p.slug}`);
    if (bySlug[o.slice(1)]) problems.push(`old address ${o} is also a page of its own`);
    oldSeen[o] = p.slug;
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const usedAssets = new Set();
  const origin = `https://${site.domain}`;

  for (const p of pages) {
    const base = p.slug === 'home' ? '' : '../';
    const ctx = {
      asset: rel => base + rel,
      useAsset: rel => usedAssets.add(rel),
      linkHtml: id => {
        const l = links[id];
        if (!l) { problems.push(`content/${p.slug}.md: [[${id}]] is not in data/links.json`); return esc(`[[${id}]]`); }
        return `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`;
      },
      aHtml: (label, url) => {
        const local = !/^(https?:|mailto:|tel:|#)/i.test(url) && !url.startsWith('//');
        if (local) usedAssets.add(url.split('#')[0]);
        const href = local ? base + url : url;
        const ext = local ? '' : ' target="_blank" rel="noopener"';
        return `<a href="${esc(href)}"${ext}>${makeInline({ ...ctx, aHtml: (l) => esc(l) })(label)}</a>`;
      },
      button: spec => {
        let m = spec.match(/^\[\[([A-Za-z0-9_-]+)\]\]$/);
        if (m) {
          const l = links[m[1]];
          if (!l) { problems.push(`content/${p.slug}.md: @button [[${m[1]}]] is not in data/links.json`); return ''; }
          return `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`;
        }
        m = spec.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (!m) { problems.push(`content/${p.slug}.md: cannot read @button ${spec}`); return ''; }
        const local = !/^(https?:)/i.test(m[2]);
        if (local) usedAssets.add(m[2]);
        return `<a class="btn" href="${esc(local ? base + m[2] : m[2])}"${local ? '' : ' target="_blank" rel="noopener"'}>${esc(m[1])}</a>`;
      },
      embedUrl: u => (u.startsWith('//') ? 'https:' + u : u),
      datesHtml: () => {
        const upcoming = sortEvents(dates.events);
        return `<ul class="events">${upcoming.map(eventHtml).join('')}</ul>
<p class="none" hidden>No upcoming dates yet. Check back soon.</p>
<p class="subscribe"><a class="btn" href="${base}dates.ics">Add these dates to your calendar</a></p>
<script>(function(){var n=Date.now(),l=document.querySelectorAll('.events .event'),v=0;for(var i=0;i<l.length;i++){if(+l[i].dataset.end<n)l[i].hidden=true;else v++}if(!v)document.querySelector('.none').hidden=false})()</script>`;
      },
    };
    let main;
    try { main = renderBody(p.body, ctx); }
    catch (e) { problems.push(`content/${p.slug}.md: ${e.message}`); main = ''; }
    if (p.slug === 'home') {
      const next = sortEvents(dates.events);
      if (next.length) {
        main += `\n<section class="next-up"><h2>Important Dates</h2><ul class="events">${next.map(eventHtml).join('')}</ul>` +
          `<p class="none" hidden>No upcoming dates yet.</p><p><a class="more" href="dates/">All important dates →</a></p></section>` +
          `<script>(function(){var n=Date.now(),l=document.querySelectorAll('.next-up .event'),v=0;for(var i=0;i<l.length;i++){if(+l[i].dataset.end<n||v>=3)l[i].hidden=true;else v++}if(!v)document.querySelector('.next-up .none').hidden=false})()</script>`;
      }
    }
    const navHtml = site.nav.filter(s => bySlug[s]).map(s =>
      `<a href="${base}${s === 'home' ? '' : s + '/'}"${s === p.slug ? ' aria-current="page"' : ''}>${esc(bySlug[s].meta.nav || bySlug[s].meta.title)}</a>`).join('');
    const canonical = p.slug === 'home' ? `${origin}/` : `${origin}/${p.slug}/`;
    const html = shell({ title: p.meta.title, description: p.meta.description, base, navHtml, main, slug: p.slug, site, canonical });
    const dir = p.slug === 'home' ? outDir : path.join(outDir, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    for (const o of p.meta.old) {
      const od = path.join(outDir, o.slice(1));
      fs.mkdirSync(od, { recursive: true });
      const to = p.slug === 'home' ? '../' : `../${p.slug}/`;
      fs.writeFileSync(path.join(od, 'index.html'), redirectPage(to, canonical));
    }
  }

  // assets: copy everything under assets/ to the site root (img/, files/, site.css, favicon.svg)
  const copyDir = (src, dst) => {
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, ent.name), d = path.join(dst, ent.name);
      if (ent.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else fs.copyFileSync(s, d);
    }
  };
  copyDir(path.join(ROOT, 'assets'), outDir);
  for (const a of usedAssets) if (!fs.existsSync(path.join(outDir, a))) problems.push(`a page uses ${a}, which is not in assets/`);

  fs.writeFileSync(path.join(outDir, 'dates.json'), JSON.stringify(dates, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'links.json'), JSON.stringify(links, null, 2) + '\n');
  const pagesJson = {
    _about: 'Every page of this site as plain text, for SUNNY (the RSD rep assistant). Built by build.js from content/*.md.',
    origin,
    pages: [...site.nav.filter(s => bySlug[s]), ...pages.map(p => p.slug).filter(s => !site.nav.includes(s))].map(s => {
      const p = bySlug[s];
      return { slug: s, title: p.meta.title, url: s === 'home' ? `${origin}/` : `${origin}/${s}/`, text: pageText(p.body, { links, origin, problems, slug: s }) };
    }),
  };
  for (const p of pagesJson.pages) if (!p.text) problems.push(`content/${p.slug}.md: no words for pages.json`);
  fs.writeFileSync(path.join(outDir, 'pages.json'), JSON.stringify(pagesJson, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'dates.ics'), icsFor(dates, site.domain));
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  if (site.cname) fs.writeFileSync(path.join(outDir, 'CNAME'), site.cname + '\n');
  fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(p => `<url><loc>${origin}/${p.slug === 'home' ? '' : p.slug + '/'}</loc></url>`).join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(outDir, '404.html'), notFound());

  // build.json: a fingerprint of every input, so a publish can be read back from the live site.
  const h = crypto.createHash('sha256');
  for (const rel of ['data/site.json', 'data/links.json', 'data/dates.json', ...files.map(f => 'content/' + f)]) h.update(rel + '\0' + fs.readFileSync(path.join(ROOT, rel)));
  const fingerprint = h.digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(outDir, 'build.json'), JSON.stringify({ fingerprint, pages: pages.map(p => p.slug), events: dates.events.length }, null, 2) + '\n');
  return { problems, fingerprint, pages: pages.map(p => p.slug) };
}

function notFound() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found — Rising Sun Division</title><meta name="robots" content="noindex">
<script>(function(){var p=location.pathname,b=p.indexOf('/risingsunevents/')===0?'/risingsunevents/':'/';var r=p.slice(b.length);
if(/^new-events(\\/|$)/.test(r)){location.replace(b+'dates/');return}
if(/^s\\//.test(r)){location.replace(b+'files/'+r.slice(2));return}
document.addEventListener('DOMContentLoaded',function(){document.getElementById('home').href=b})})()</script>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 16px;color:#1a2433}a{color:#b8381a}</style></head>
<body><h1>That page isn't here</h1><p>The Rising Sun Division site was rebuilt and some pages moved.</p><p><a id="home" href="/">Go to the home page</a></p></body></html>
`;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const out = check ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'rse-check-')) : path.join(ROOT, 'docs');
  let r;
  try { r = build(out); }
  catch (e) { console.error(`BUILD FAILED: ${e.message}`); process.exit(1); }
  if (check) fs.rmSync(out, { recursive: true, force: true });
  if (r.problems.length) {
    for (const p of r.problems) console.error(`BUILD PROBLEM: ${p}`);
    console.error(`BUILD FAILED: ${r.problems.length} problem(s); nothing should be published.`);
    process.exit(1);
  }
  console.log(`${check ? 'check ok' : 'built docs/'}: ${r.pages.length} pages, fingerprint ${r.fingerprint}`);
}

module.exports = { build, renderBody, checkDates, icsFor, sortEvents, pageText };
