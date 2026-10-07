#!/usr/bin/env python3
"""Regenerates site/_headers: security headers + Content-Security-Policy + cache rules.

The site's big scripts now live in assets/app*.js (allowed by 'self'): editing THOSE never needs this tool.
Only the few tiny inline <script> blocks left inside index.html are allowed by hash. If you edit one of them,
run this tool, otherwise the browser blocks it ("Refused to execute inline script ... Content Security Policy").
Editing only text/CSS/HTML is always safe.

    python3 tools/make_headers.py site/index.html
"""
import base64, hashlib, re, sys

path = sys.argv[1] if len(sys.argv) > 1 else 'site/index.html'
html = open(path, encoding='utf-8').read()

hashes = []
for m in re.finditer(r'<script([^>]*)>(.*?)</script>', html, re.S):
    attrs, body = m.group(1), m.group(2)
    if 'src=' in attrs or 'ld+json' in attrs or not body.strip():
        continue
    hashes.append("'sha256-%s'" % base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode())

import glob, os
sources = [html] + [open(f, encoding='utf-8').read() for f in glob.glob(os.path.join(os.path.dirname(path) or '.', 'assets', '*.js'))]
sb = next((m for m in (re.search(r"SUPABASE_URL\s*=\s*'(https://[a-z0-9]+\.supabase\.co)'", t) for t in sources) if m), None)
if not sb:
    sys.exit('Could not find SUPABASE_URL in ' + path + ' or assets/*.js')
SB = sb.group(1)

csp = '; '.join([
    "default-src 'self'",
    "script-src 'self' " + ' '.join(hashes) + " https://challenges.cloudflare.com https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob: " + SB,
    "connect-src 'self' " + SB + " https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "upgrade-insecure-requests",
])
out = path.rsplit('/', 1)[0] + '/_headers' if '/' in path else '_headers'
open(out, 'w').write(f'''/*
  Content-Security-Policy: {csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), clipboard-read=(self), clipboard-write=(self), camera=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable
''')
print(f'{out} written: {len(hashes)} inline scripts allowed, Supabase = {SB}')
