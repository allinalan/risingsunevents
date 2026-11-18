# Moving www.risingsunevents.net from Squarespace to this repo

**Done 2026-11-17** (steps 1-3; step 4's switch is set, live with SUNNY's next deploy; step 5 is Alan's). At Squarespace the
records were under Custom records, not a Defaults preset, so the four Squarespace `A @` records were edited in place to
GitHub's four and `www` from ext-cust.squarespace.com to allinalan.github.io; the two Google (`gv-…googlehosted.com`) and
one Squarespace verify CNAME were left alone. Before: A @ 198.185.159.144/.145, 198.49.23.144/.145, CNAME www
ext-cust.squarespace.com (to roll back, put those back and set `cname` to null). Editing DNS asks for a fresh Google
sign-in as the Squarespace account's owner. The certificate came ~10 min after the domain was set; `verify` passed 29/29.

Squarespace stays live until Alan has looked at the staged site and the webmaster's read-back passes.

1. **Alan, at Squarespace Domains → risingsunevents.net → DNS:** delete the Squarespace Defaults records, then add
   - `A` `@` 185.199.108.153 · `A` `@` 185.199.109.153 · `A` `@` 185.199.110.153 · `A` `@` 185.199.111.153
   - `CNAME` `www` allinalan.github.io
   (Optional preview first: `CNAME` `new` allinalan.github.io, then step 2 with `new.risingsunevents.net`.)
2. **Claude/the mini:** set `"cname": "www.risingsunevents.net"` in data/site.json, build, push; in the repo's Pages
   settings set the custom domain and, once GitHub has the certificate, Enforce HTTPS
   (`gh api -X PUT repos/allinalan/risingsunevents/pages -f cname=www.risingsunevents.net -F https_enforced=true`).
3. Read back: `node webmaster.js verify` in rsd-shift-picking (every page 200 on www, build.json fingerprint matches,
   the old addresses forward, apex → www).
4. Turn SUNNY onto the site's dates.json (`SUNNY_DATES_SOURCE=site` in sunny-bot's Vercel env).
5. **Alan:** cancel the Squarespace *website* plan only. Keep the domain registration (renews 2027-02-21).
