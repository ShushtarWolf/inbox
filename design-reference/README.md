# Design reference (visual + IA source of truth)

**Current source of truth:** the self-contained HTML prototype under
`inbox-all-pages-html/` — **not** Canva PNG exports.

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
4. Done gate: match regions, hierarchy, tokens, and IA from the HTML; do not invent TailAdmin chrome or re-apply old Canva square-only rules unless the HTML itself is square.
