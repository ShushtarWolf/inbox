# Design reference (visual + IA source of truth)

**Current source of truth:** the latest owner-provided complete HTML prototype at
`inbox-all-pages-html/prototype.html` (see that folder’s README for checksum) —
**not** Canva PNG exports.

| Path | Role |
|------|------|
| [`inbox-all-pages-html/`](./inbox-all-pages-html/) | Tracked HTML prototype (desktop + mobile screens) |
| [`MAP.md`](./MAP.md) | Prototype `go()` screen id → Nuxt route |
| [`../.cursor/rules/html-prototype-frames-locked.mdc`](../.cursor/rules/html-prototype-frames-locked.mdc) | Agent visual/IA lock |

Canva image dumps under `canva-reference/` are **archived** (historical pixel sync only). Do not treat Canva frames as binding for new UI work.

## How to use

1. Open `inbox-all-pages-html/prototype.html` in a browser (file:// is fine).
2. Use the sticky proto nav / `go('…')` screen ids from [`MAP.md`](./MAP.md).
3. Implement or restyle the matching Nuxt route against that screen — keep product APIs, auth, and real club photos.
4. **Radius:** rendered HTML is **square** (`border-radius: 0 !important`). Do not invent soft 10/20px chrome.
5. Track gaps in [`GAPS.md`](./GAPS.md).
6. Visual gate:

```bash
# HTML + live (default live = http://127.0.0.1:3000)
npm run check:html -- --screen home --route /

# Against production
npm run check:html -- --screen home --route / --base https://inboxs.ir
```

PNGs land in `design-reference/comparisons/<screen>/` (`html-*-375.png`, `live-*-desktop.png`, …).
