# VPN & international access (inboxs.ir)

## Why the site fails with VPN / outside Iran

Production runs on **Liara Iran**. The public edge IP (`185.208.181.133`) **resets TLS handshakes** for many non-Iranian clients. A VPN exit IP looks like that, so the browser never completes HTTPS — even though the app itself is healthy inside Liara.

This is **not** application geo-blocking. There is no IP country filter in the Nuxt app.

| Path | Without VPN (Iran ISP) | With VPN / abroad |
|------|------------------------|-------------------|
| Direct to Liara IP | Usually works | TLS fail / timeout |
| Via Cloudflare Tunnel | Works | Works |

## Fix: Cloudflare Tunnel (recommended)

Users connect to **Cloudflare’s global network**. The Liara container dials **out** to Cloudflare (Iran → world usually works). Traffic never depends on inbound TLS to the Iran edge IP.

### 1. Put `inboxs.ir` on Cloudflare DNS

1. Create a [Cloudflare](https://dash.cloudflare.com/) account and add `inboxs.ir`.
2. At your registrar (NIC.ir or wherever `.ir` NS are set), replace Liara nameservers (`ns1.liara.zone` / `ns2.liara.zone`) with the two Cloudflare nameservers Cloudflare gives you.
3. Wait until Cloudflare shows the zone as **Active**.

Keep `www` as a CNAME or AAAA/A as Cloudflare instructs once the tunnel hostname is created (step 3).

### 2. Create a Cloudflare Tunnel

1. Cloudflare Zero Trust (or **Networking → Tunnels**) → **Create a tunnel** → Cloudflared.
2. Name it e.g. `inbox-liara`.
3. Copy the **tunnel token** (starts with `eyJ…`).
4. Add a **Published application** route:
   - Hostname: `inboxs.ir` (and optionally `www.inboxs.ir`)
   - Service: `http://localhost:3000`
5. Save. Cloudflare will create the DNS records for those hostnames (proxied / orange cloud).

### 3. Set the token on Liara

In Liara → `inbox` app → Environment variables:

```text
CLOUDFLARE_TUNNEL_TOKEN=<paste-token>
NUXT_PUBLIC_SITE_URL=https://inboxs.ir
```

Redeploy (or restart) the app. On boot, `start-production` downloads `cloudflared` and runs:

```text
cloudflared tunnel run --token …
node .output/server/index.mjs
```

### 4. Liara domain SSL (optional)

When Cloudflare proxies `inboxs.ir`, visitors never hit Liara’s public HTTPS for that hostname. You can leave Liara’s custom domain attached for the fallback `*.liara.run` URL, or disconnect it to avoid confusion. Prefer **Full** SSL mode in Cloudflare toward the tunnel (Cloudflare terminates browser TLS; the tunnel is already encrypted).

### 5. Verify

With VPN **on** (foreign exit IP):

```bash
curl -sI https://inboxs.ir/ | head
curl -s https://inboxs.ir/api/health
```

Expect `200` / `{"ok":true,…}` and `server: cloudflare` (or similar CF headers).

## Temporary workaround (no Cloudflare)

Turn the VPN **off** (or split-tunnel so `inboxs.ir` goes direct) when using the site from inside Iran. That only works for users whose ISP can reach Liara’s Iran edge.

## Related env

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Enables outbound Cloudflare Tunnel on Liara boot |
| `NUXT_PUBLIC_SITE_URL` | Must stay `https://inboxs.ir` for links / OAuth |
