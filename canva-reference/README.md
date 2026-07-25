# Canva reference (local only)

Token-efficient Canva ↔ app comparison workspace. Image dumps are gitignored.

## Where to put your export

1. Download the Canva design as a **ZIP of images** (PNG/JPG pages).
2. Extract the ZIP.
3. Put **all page image files** here:

```text
canva-reference/pages/
```

Full path on this machine:

```text
/Users/siamakghodsi/Projects/inbox/canva-reference/pages/
```

You can either:

- copy only the `.png` / `.jpg` files into `pages/`, or
- move the whole extracted folder’s contents into `pages/` (flat is best).

Watermarks from Canva Free are fine.

## Folder layout

```text
canva-reference/
├── README.md              ← this file (tracked)
├── pages/                 ← YOUR Canva page images (put files here)
├── contact-sheets/        ← low-res index grids (generated later)
└── comparisons/
    ├── localhost/         ← 375px captures of the live app
    ├── diffs/             ← pixel-diff outputs
    └── overlays/          ← Canva vs app overlays
```

## Tips

- Prefer one image per Canva page, kept in Canva order.
- Do not ask the agent to open every full-size page at once.
- First pass: list filenames / contact sheet; then open only the page for the current task.
