#!/usr/bin/env node
/**
 * Create a Cloudflare Tunnel for inboxs.ir → http://localhost:3000
 * and print the token + nameservers for NIC.ir / Liara.
 *
 * Prerequisites:
 *   1. Cloudflare account with inboxs.ir added (Free is fine)
 *   2. API token with: Account.Cloudflare Tunnel:Edit, Zone.DNS:Edit, Zone:Read
 *      https://dash.cloudflare.com/profile/api-tokens → Create Token
 *      Use template "Edit Cloudflare Tunnel" or custom permissions above.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… node scripts/setup-cloudflare-tunnel.mjs
 *
 * Optional:
 *   CLOUDFLARE_ACCOUNT_ID=…   (auto-detected if only one account)
 *   TUNNEL_NAME=inbox-liara
 *   DOMAIN=inboxs.ir
 */
const API = 'https://api.cloudflare.com/client/v4'
const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
const tunnelName = process.env.TUNNEL_NAME || 'inbox-liara'
const domain = process.env.DOMAIN || 'inboxs.ir'

if (!token) {
  console.error('Set CLOUDFLARE_API_TOKEN first.')
  process.exit(1)
}

async function cf(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!json.success) {
    const err = JSON.stringify(json.errors || json, null, 2)
    throw new Error(`${method} ${path} failed:\n${err}`)
  }
  return json.result
}

async function main() {
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (!accountId) {
    const accounts = await cf('GET', '/accounts')
    if (!accounts.length) throw new Error('No Cloudflare accounts on this token')
    accountId = accounts[0].id
    console.log(`Using account: ${accounts[0].name} (${accountId})`)
  }

  const zones = await cf('GET', `/zones?name=${encodeURIComponent(domain)}`)
  if (!zones.length) {
    throw new Error(
      `Zone ${domain} not found. In Cloudflare dashboard: Add site → ${domain} (Free), then re-run.`,
    )
  }
  const zone = zones[0]
  console.log(`Zone: ${zone.name} status=${zone.status}`)
  console.log('\n=== NAMESERVERS (paste these at NIC.ir) ===')
  for (const ns of zone.name_servers || []) console.log(`  ${ns}`)
  console.log('==========================================\n')

  // List or create tunnel
  let tunnels = await cf('GET', `/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(tunnelName)}&is_deleted=false`)
  let tunnel = tunnels[0]
  if (!tunnel) {
    tunnel = await cf('POST', `/accounts/${accountId}/cfd_tunnel`, {
      name: tunnelName,
      config_src: 'cloudflare',
    })
    console.log(`Created tunnel: ${tunnel.name} id=${tunnel.id}`)
  } else {
    console.log(`Found tunnel: ${tunnel.name} id=${tunnel.id}`)
  }

  // Token for cloudflared
  const tokenResult = await cf('GET', `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/token`)
  // API may return string or {tunnel_token}
  const tunnelToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token || tokenResult
  console.log('\n=== LIARA ENV (set on inbox app) ===')
  console.log(`CLOUDFLARE_TUNNEL_TOKEN=${tunnelToken}`)
  console.log('====================================\n')

  // Ingress config
  await cf('PUT', `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/configurations`, {
    config: {
      ingress: [
        { hostname: domain, service: 'http://localhost:3000' },
        { hostname: `www.${domain}`, service: 'http://localhost:3000' },
        { service: 'http_status:404' },
      ],
    },
  })
  console.log('Tunnel ingress: inboxs.ir + www → http://localhost:3000')

  // DNS CNAME to tunnel
  const cnameTarget = `${tunnel.id}.cfargotunnel.com`
  for (const name of [domain, `www.${domain}`]) {
    const existing = await cf('GET', `/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`)
    const body = {
      type: 'CNAME',
      name,
      content: cnameTarget,
      proxied: true,
      ttl: 1,
    }
    if (existing[0]) {
      await cf('PUT', `/zones/${zone.id}/dns_records/${existing[0].id}`, body)
      console.log(`Updated DNS CNAME ${name} → ${cnameTarget} (proxied)`)
    } else {
      // Apex might already be A/AAAA — delete conflicting A/AAAA first for this name
      const conflicts = await cf('GET', `/zones/${zone.id}/dns_records?name=${encodeURIComponent(name)}`)
      for (const rec of conflicts) {
        if (rec.type === 'A' || rec.type === 'AAAA' || rec.type === 'CNAME') {
          await cf('DELETE', `/zones/${zone.id}/dns_records/${rec.id}`)
          console.log(`Removed conflicting ${rec.type} ${name}`)
        }
      }
      await cf('POST', `/zones/${zone.id}/dns_records`, body)
      console.log(`Created DNS CNAME ${name} → ${cnameTarget} (proxied)`)
    }
  }

  console.log(`
Next on YOUR side:
  1. NIC.ir → DNS / nameservers → replace Liara NS with the two printed above
  2. Wait until Cloudflare zone status is Active
  3. Liara → inbox → Environment → set CLOUDFLARE_TUNNEL_TOKEN (printed above)
  4. Redeploy inbox (branch with tunnel support)
  5. SSL/TLS → Overview → mode Full (not Flexible)
`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
