# Private access from your phone

Run Lumen on an always-on computer and open it through Tailscale Serve on your phone. All devices share the same saved topics, reviews, and Codex connection. The phone does not run Codex and requires a connection to the host.

## Setup on the host

1. Install [Tailscale](https://tailscale.com/download) on the host and phone. Sign in to the same private tailnet. Restrict access to the host in your tailnet access policy if you share the tailnet with other people.
2. Install Node.js 24 and Codex CLI on the host. Run `codex login` **on the host**, completing its browser sign-in there. Browser-based Codex login on a remote phone uses a localhost callback, so configure the host's login first.
3. Clone the app and install it:

   ```sh
   git clone git@github.com:lahnstrom/Lumen.git
   cd Lumen
   npm ci
   npm run build
   ```

4. On the host, run:

   ```sh
   tailscale serve --bg http://127.0.0.1:4317
   tailscale serve status
   ```

   Tailscale may ask you to enable HTTPS. Note the exact `https://…ts.net` address printed by Serve. Use **Serve**, which is private to your tailnet, not Funnel.

5. Start Lumen with that exact origin and your Tailscale account login (replace the example values):

   ```sh
   LUMEN_TAILSCALE_ORIGIN=https://your-host.your-tailnet.ts.net \
   LUMEN_TAILSCALE_USERS=you@example.com \
   npm start
   ```

   For multiple authorized people, supply comma-separated Tailscale login names. This is one shared workspace, not separate accounts: everyone allowed can access the sources and use the host's Codex allowance. No wildcard origins or anonymous remote access are enabled. Keep the HTTP listener on loopback; Serve supplies authenticated identity headers to it.

6. Enable Tailscale on your phone, visit the HTTPS address, and add it to your home screen from your browser's menu. The app supports standalone display. It is not an offline PWA.

## Keeping it available

The host must stay powered, awake, online, and running Lumen. `tailscale serve --bg` persists the proxy configuration, but does not start Lumen. Initially leave `npm start` running; an always-on installation should use the host's service manager (launchd on macOS, systemd on Linux) with these environment variables and your normal user account.

If using WSL, the simplest deployment is to run both Lumen and Tailscale in the same environment, or move both to the dedicated host. A Windows Tailscale installation and a WSL server may require additional forwarding; the recipe above assumes Serve can reach the server on its own `127.0.0.1:4317`.

To move hosts, stop Lumen and copy `data/workspace.json` to the new host's `data/` directory. Sign in to Codex on the new host. Codex conversation threads live in Codex's own storage and are not included in this JSON backup; preserving continued AI thread history also requires a supported Codex history transfer. Do not publish your data or account credentials to Git.

## Verification and troubleshooting

- Local access: `http://localhost:4317` should still work.
- On the phone: enable Tailscale and use the exact HTTPS Serve URL.
- A 403 means the configured origin, login allowlist, or Tailscale identity does not match.
- A 502 usually means Lumen is stopped, asleep, or on a different port.
- Turn off this Serve endpoint with `tailscale serve --https=443 off`.

Reference: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) and [CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).
