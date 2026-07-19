# Enamad (اینماد) — paste-and-go after signup

Site pages are already live. After you register on [enamad.ir](https://enamad.ir), you mostly set Liara env vars and restart/redeploy. No code change needed for the common verification methods.

Production app: **Liara `inbox`** · https://inboxs.ir

## Before you apply (you must provide)

Set these on Liara so `/contact` and `/about` match what you submit to Enamad:

| Variable | Example | Required for approval |
|----------|---------|------------------------|
| `NUXT_PUBLIC_CONTACT_OWNER_NAME` | نام و نام خانوادگی شما | Strongly recommended |
| `NUXT_PUBLIC_CONTACT_ADDRESS` | آدرس پستی کامل | Yes |
| `NUXT_PUBLIC_CONTACT_POSTAL_CODE` | ۱۰ رقم | Yes (postal verification) |
| `NUXT_PUBLIC_CONTACT_LANDLINE` | `021-xxxxxxx` | Yes |
| `NUXT_PUBLIC_CONTACT_MOBILE` | `09124777927` | Already defaulted |
| `NUXT_PUBLIC_CONTACT_EMAIL` | `info@inboxs.ir` | Already defaulted |

Also confirm **Whois** for `inboxs.ir` is under your personal name (شخص حقیقی).

Then redeploy/restart and check https://inboxs.ir/contact

## During Enamad signup — domain verification (pick one)

### A) Meta tag (recommended for us)

1. Copy the `content` value from Enamad’s meta tag (not the whole tag).
2. Set on Liara:

```bash
NUXT_PUBLIC_ENAMAD_META_CONTENT=PASTE_CONTENT_HERE
```

3. Redeploy/restart.
4. View source on https://inboxs.ir — you should see `<meta name="enamad" content="…">`.
5. Click confirm meta in Enamad panel.

### B) Verification file

1. Enamad asks for a filename like `1234567.txt`.
2. Set:

```bash
NUXT_PUBLIC_ENAMAD_VERIFY_FILE=1234567.txt
```

3. Redeploy/restart.
4. Open `https://inboxs.ir/1234567.txt` — should return empty 200 text/plain.
5. Confirm file upload in Enamad panel.

(Implemented via server middleware matching that exact path — not a catch-all route.)

### C) Temporary homepage title

1. Enamad gives a phrase to put as the site title.
2. Set:

```bash
NUXT_PUBLIC_ENAMAD_TITLE_OVERRIDE=exact phrase from panel
```

3. Redeploy/restart, confirm title on homepage, then confirm in panel.
4. **Remove** this env var after verification succeeds (redeploy again).

### D) Email to info@inboxs.ir

If Enamad emails a code to `info@…`, you must read that mailbox yourself and paste the code into the panel. (Site already lists `info@inboxs.ir`.)

## After approval — show the badge

From the Enamad badge HTML, copy `id` and `Code` query values, then set:

```bash
NUXT_PUBLIC_ENAMAD_ID=123456
NUXT_PUBLIC_ENAMAD_CODE=AbCdEf
```

Redeploy/restart. The seal appears in the footer and on `/contact` automatically.

## Already done on the website

- `/about` `/contact` `/pricing` `/complaints` `/cancellation` `/terms` `/privacy`
- Footer links
- Booking cost summary (pre-invoice)
- Cancel/refund policy page
- Badge + verification hooks (this doc)

## What only you can do

1. دولت من signup on enamad.ir  
2. Upload ID / commitment form  
3. Whois ownership  
4. Postal package verification (کدپستی)  
5. Panel checklist submit + pay fee  
6. Give Cursor/Agent the env values above if you want them set for you  

## Quick operator checklist

- [ ] Owner name + full address + postal code + landline on Liara  
- [ ] Whois matches applicant  
- [ ] Signup + domain verify (meta or file)  
- [ ] Documents + pay  
- [ ] Panel business checklist green  
- [ ] After approve: set `ENAMAD_ID` + `ENAMAD_CODE`  
- [ ] Remove title override if used  
