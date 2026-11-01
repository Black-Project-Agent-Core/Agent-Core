# Cloudflare Tunnel: public access to Agent Core

Agent Core can be reached from the internet through a Cloudflare named tunnel, beside the existing OpenAI `tunnel-client` path. The local listener stays on `127.0.0.1:8765`; nothing is opened on the router.

```text
remote MCP client (https)
    -> Cloudflare edge  (hostname + path allowlist)
    -> cloudflared.exe  (runtime\tools\cloudflared, outbound connection only)
    -> http://127.0.0.1:8765/mcp  (API key or OAuth token, tool grants, controller_contract)
```

## What is and is not published

Tunnel traffic reaches Agent Core from `127.0.0.1`, so Agent Core's loopback checks cannot tell it from local traffic. The only reliable boundary is the path allowlist on the tunnel hostname. Publish exactly these paths and nothing else:

```text
^/(mcp|oauth/(register|authorize|token)|\.well-known/oauth-(protected-resource(/mcp)?|authorization-server))$
```

Everything else (`/health`, `/agent/*`) must answer 404 on the public hostname. `-Action Verify` proves this. Do not publish a hostname rule without the path, and do not set `AGENT_CORE_TRUST_PROXY=true` for this path: the policy then reads the first `X-Forwarded-For` entry, which a client can set.

Authentication is unchanged: `/mcp` needs an Agent Core API key (`Authorization: Bearer ...`) or an OAuth access token, the credential's tool grants, and a current `controller_contract` acknowledgement. The OAuth authorize page asks for an Agent Core API key; share the URL only with clients you intend to authorize, and create one key per client so it can be revoked alone.

## One-time setup

1. Install cloudflared (project-local, SHA-256 verified against the digest GitHub publishes):

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\Start-Cloudflare-Tunnel.ps1 -Action Install
   ```

2. In Cloudflare Zero Trust > Networks > Tunnels, create a tunnel (type Cloudflared) and copy its token. Put it in `.env` as `CLOUDFLARE_TUNNEL_TOKEN=` (the slot is already there; `secrets\cloudflare-tunnel-token.txt` works as a fallback). The token reaches cloudflared through its environment, never the command line. Do not paste it into a chat or commit it.
3. In the tunnel's Public Hostname, add one entry: your hostname (for example `agent-core.example.com`, on a zone in this Cloudflare account), service `HTTP` `127.0.0.1:8765`, and the path expression above. Keep the default catch-all `http_status:404`.
4. Set `CLOUDFLARE_TUNNEL_HOSTNAME=agent-core.example.com` in `.env` (hostname only; a pasted `https://` or path is tolerated, an invalid value is ignored). Agent Core derives `https://<hostname>/mcp` as its additional OAuth identity and leaves `AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL` (the OpenAI tunnel) untouched. Restart Agent Core afterwards.

   Extra identities can still be listed in `AGENT_CORE_OAUTH_ADDITIONAL_RESOURCE_URLS` (comma separated, plain `https` URLs); an invalid value there stops Agent Core at startup with an explicit error.

5. Start the tunnel and verify it:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\Start-Cloudflare-Tunnel.ps1 -Action Run -Background
   powershell -ExecutionPolicy Bypass -File scripts\windows\Start-Cloudflare-Tunnel.ps1 -Action Verify
   ```

   Verify reads the hostname from `.env` (or pass `-Url https://<hostname>`). Every line must read PASS. A FAIL on a "NOT exposed" line means the path allowlist is missing or wrong: stop the tunnel (`-Action Stop`) and fix step 3.

## Existing Worker / Windows service route

The independent OpenAI tunnel-client path is unchanged. The existing Worker `agent-core-mcp.joefreccejunior50.workers.dev` uses the Workers VPC binding `AGENT_CORE_ORIGIN` and named-tunnel Windows service to reach the loopback gateway on port 8788, which forwards to authenticated Core port 8765. This supersedes the historical 2026-10-25 Quick Tunnel route. The gateway fixes upstream `Host` to the Worker hostname after removing external forwarding headers. Public OAuth metadata must name `https://agent-core-mcp.joefreccejunior50.workers.dev/mcp`; unauthenticated MCP must return 401 and excluded paths 404. Four ready edge connections alone do not prove that the local gateway or public origin is healthy. Current startup repair and activation evidence: [Cloudflare startup recovery](verification/Cloudflare-Startup-Recovery.md).

## Clients

- **API key:** connect to `https://<hostname>/mcp` with `Authorization: Bearer <key>`.
- **OAuth connector:** use `https://<hostname>/mcp`; the connector discovers the metadata paths and shows the Agent Core authorize page, where you paste an API key.

## How two public identities coexist

OAuth tokens are bound to one resource URL. `AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL` is the default identity (OpenAI tunnel). Each URL in `AGENT_CORE_OAUTH_ADDITIONAL_RESOURCE_URLS` becomes a second identity, selected when the request `Host` matches its hostname (cloudflared forwards the original `Host`). Metadata, authorization and token validation then use that identity. A token issued for one identity is rejected on the other.

## Operations

- `-Action Status` shows the process and the last log lines; `-Action Stop` stops only the project-local `cloudflared.exe`.
- **Starts with `Agent Core.exe`.** The launcher first recognizes an existing `Cloudflared` Windows service whose executable exactly matches this project. Running/starting instances are reused; a matching stopped service is started when Windows permissions allow it. Query/identity failures never mean "absent" and never authorize a second connector. The launcher preserves the SCM-managed process on shutdown/restart. If no matching service exists, the existing optional child mode uses `CLOUDFLARE_TUNNEL_TOKEN` or `secrets\cloudflare-tunnel-token.txt`; tokens remain in environment/token file and never in arguments. Core and gateway start before the optional child; a failing OpenAI tunnel cannot prevent that Cloudflare step.
- The 30-second watchdog starts before initial bring-up and remains available after a cold-start timeout. It recovers a late-ready Core, gateway and tunnels under the existing lifecycle lock. Cloudflared reconnects to the edge itself; a running SCM service is reused rather than killed on a network drop. `restart-tunnel`/`restart-all` preserve service ownership; launcher-owned child connectors can still be replaced. Closing the launcher does not stop an independent Windows service. The manual script still identifies ordinary children through process paths: non-elevated inspection can miss a SYSTEM service, so do not use its Run/Stop actions to manage the SCM instance; use Windows service management for that instance.
- Without the launcher, use Task Scheduler on `-Action Run -Background`, or `cloudflared service install` (needs administrator rights and installs a system service outside the project).
- Log: `runtime\tools\cloudflared\cloudflared.log`. Do not raise the log level to `debug`: it records request headers, including credentials.
- Optional hardening in Cloudflare: a rate-limiting rule on `/oauth/*` and `/mcp`; an Access policy with a service token for non-OAuth clients (an Access login in front of the OAuth paths breaks OAuth connectors).

## Reading a probe result

Agent Core answers with JSON (`{"error": "..."}`); an HTML page comes from Cloudflare, not from Agent Core. These answers come from `src/http/app.ts` and `src/oauth/service.ts`:

| Probe | Answer | Meaning |
|---|---|---|
| `/mcp` without credentials | `401` with a `WWW-Authenticate` challenge | The tunnel and the listener are alive. This is the expected answer of a healthy endpoint, not a failure. |
| `/mcp` from a browser origin the policy refuses | `403 forbidden_origin` | The listener was reached; the `Origin` header is refused. Alive, but the client or the allowed-origins setting needs a change. |
| `/health` or `/agent/*` on the public hostname | `404 not_found` | Expected: these paths must not be published (`-Action Verify` checks it). |
| `/oauth/register` more than 20 times a minute, or while 50 registered clients have never authorized | `429` with `Retry-After` | Registration limit, not an outage. |
| An HTML Cloudflare error page (for example `502`, or `530` with error `1033`) or a timeout | not an Agent Core answer | The tunnel or the listener is down. Check `-Action Status` and the local listener on `127.0.0.1:8765`. |

A probe that expects `200` from `/mcp` without credentials will report a healthy endpoint as dead.

## Limits

The tunnel runs only while this PC and cloudflared run. Compatibility of a specific third-party connector with Agent Core's OAuth (public dynamic registration, `client_secret_post`, S256 PKCE) is not guaranteed by this document.
