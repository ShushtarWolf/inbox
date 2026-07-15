# VPN & international access (inboxs.ir)

## The Cloudflare “400 — plain HTTP request was sent to HTTPS port” error

You are seeing **Liara’s own edge**, which is powered by Cloudflare. It does **not** mean your domain is correctly set up on a Cloudflare account.

Public DNS:

```text
inboxs.ir → NS ns1.liara.zone / ns2.liara.zone
inboxs.ir → A  185.208.181.133   (Liara Iran edge)
```

| URL you open | Expected after repair |
|--------------|------------------------|
| `http://inboxs.ir` | **301 → https://inboxs.ir/** (`server: Liara`) — not CF 400 |
| `https://inboxs.ir` from Iran ISP | **200** app HTML |
| `https://inboxs.ir` with VPN / abroad | Still blocked on Liara Iran IP — use Cloudflare Tunnel below |

If HTTP 400 returns again, rebind the domain:

```bash
LIARA_API_TOKEN=… LIARA_RECREATE_DOMAIN=true npm run fix:domain
```

**Do not** “fix” this by pointing Cloudflare (orange cloud) at `185.208.181.133` with **SSL = Flexible**. Flexible sends **plain HTTP** to the origin; Liara’s port 80 speaks **HTTPS**, so you get this same 400 from Cloudflare again.

## Correct fix: Cloudflare Tunnel (not “CDN Flexible”)

Users connect to Cloudflare’s global IPs. Your Liara container dials **out** to Cloudflare. Nobody needs inbound TLS to the Iran edge IP.

### 1. Move nameservers to Cloudflare

1. [Cloudflare dashboard](https://dash.cloudflare.com/) → Add site → `inboxs.ir`
2. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`)
3. At the place that controls `.ir` NS (**NIC.ir** / your registrar), **replace**:
   - remove `ns1.liara.zone` / `ns2.liara.zone`
   - add Cloudflare’s two NS
4. Wait until Cloudflare zone status is **Active** (can take hours for `.ir`)

Until this is done, nothing you change in Cloudflare can fix `inboxs.ir`.

### 2. Create a Cloudflare Tunnel (Zero Trust)

1. **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → Cloudflared  
   (or **Networking → Tunnels**)
2. Name: `inbox-liara`
3. Copy the **token** (`eyJ…`)
4. **Published application** routes:

| Hostname | Path | Service |
|----------|------|---------|
| `inboxs.ir` | `*` | `http://localhost:3000` |
| `www.inboxs.ir` | `*` | `http://localhost:3000` |

5. Let Cloudflare create the DNS records (**proxied / orange cloud**)

SSL/TLS mode in Cloudflare for this setup can stay **Full** (browser ↔ Cloudflare). The tunnel to Liara is already encrypted; do **not** use Flexible with a tunnel.

### 3. Put the token on Liara and redeploy

Liara → app `inbox` → Environment:

```text
CLOUDFLARE_TUNNEL_TOKEN=<paste-token>
NUXT_PUBLIC_SITE_URL=https://inboxs.ir
```

Then redeploy (or merge [PR with tunnel support](https://github.com/ShushtarWolf/inbox/pull/1) and deploy).

On boot the app runs:

```text
cloudflared tunnel run --token …
node .output/server/index.mjs
```

### 4. Verify (VPN on)

```bash
dig +short inboxs.ir NS
# must be *.ns.cloudflare.com — NOT ns1.liara.zone

curl -sI https://inboxs.ir/ | head
curl -s https://inboxs.ir/api/health
```

You want Cloudflare NS, HTTP 200, and `/api/health` → `{"ok":true,...}`.

Always prefer **`https://inboxs.ir`** (not `http://`).

## Temporary workaround (Iran, no Cloudflare yet)

- Use **`https://inboxs.ir`** (not http)
- Turn VPN **off**, or split-tunnel so `inboxs.ir` goes direct

## Why Flexible CDN to Liara IP fails

```text
Browser --HTTPS--> Cloudflare --HTTP:80--> Liara
                                   ↑
                     Liara expects TLS here → 400 “plain HTTP… HTTPS port”
```

Tunnel avoids that path:

```text
Browser --HTTPS--> Cloudflare --encrypted tunnel--> cloudflared on Liara --HTTP--> localhost:3000
```

## Related env

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Starts `cloudflared` on Liara boot |
| `NUXT_PUBLIC_SITE_URL` | Keep `https://inboxs.ir` |
