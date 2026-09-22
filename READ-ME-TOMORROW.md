# Lumen at work — read this before leaving home

Your Lumen address is:

**https://pc.tailcc974f.ts.net:8443/**

Bookmark the complete address, including **:8443**. Without that port you reach the separate Flashcard Studio service.

## Before you leave: a two-minute check

1. **Leave the home PC powered on, plugged in, awake, and connected to the internet.** Locking Windows is fine. Do not shut down, sign out, or put it to sleep. Check Windows **Settings → System → Power → Screen and sleep**; the display may turn off, but the PC must stay awake while plugged in. I have not changed your power settings.
2. **Leave Tailscale connected on the home PC.** The private HTTPS forwarding on port 8443 is already configured.
3. **Open Lumen** at the address above. If it does not open, use the restart commands below before leaving.
4. **For Anki reviews, leave desktop Anki open** in your usual **User 1** profile. In Lumen, open a topic → **Flashcards → Connect Anki** once, choose the deck, then **Connect & sync**. Anki must already be signed into AnkiWeb. Resolve any initial upload/download question in Anki deliberately; Lumen does not choose a direction for you.
5. **Test from your phone on mobile data:** turn Wi-Fi off, enable Tailscale on your phone, and open the Lumen address. This is the useful test of access from outside home. Open a topic and its flashcards, then turn Wi-Fi back on if you want.

## At work

### Your phone — the simplest route

Turn on Tailscale, signed into the same personal account/tailnet as your home PC. Open:

**https://pc.tailcc974f.ts.net:8443/**

Use mobile data if the work Wi-Fi does not allow the connection. You can add Lumen to your browser's home screen. Your topics and progress are the same as at home; your phone does not need Codex installed.

### A computer at work

If that computer is permitted to run Tailscale, install/open Tailscale, sign into the same personal tailnet, connect, and use the same browser address. No Codex or Node installation is needed there.

If you cannot install or use a personal VPN on the work computer, use your phone instead. The URL is private: an ordinary browser on a computer without Tailscale cannot reach it. Do not expect it to work just because you know the address.

## How review sync works

- Connect each learning space once using **Flashcards → Connect Anki**. After that, new cards in that connected space are sent automatically.
- Lumen records answers to linked cards in desktop Anki, using Anki's scheduler and deck settings. Lumen imports those review logs and updates its counts, progress, and due status.
- Lumen checks desktop Anki every **15 seconds**, requests AnkiWeb synchronization every **two minutes**, and requests it after Lumen answers. **Sync now** runs it immediately. Cloud sync may take longer or require action in Anki.
- After studying in AnkiMobile/AnkiDroid, synchronize that app with AnkiWeb. Desktop Anki then receives the changes and Lumen picks them up. AnkiWeb browser reviews likewise need to reach desktop Anki before Lumen can see them.
- Keep desktop Anki running at home. If it is unavailable, Lumen keeps the last known status, shows a connection error, and will not create an independent schedule for linked cards.
- Existing Studio exports with their identity tags link to their existing Anki cards. Newly exported Lumen notes begin with Anki's schedule. Previous Lumen review records stay in Lumen; they are not fabricated into Anki's past history.
- This is a live app, not offline storage on your phone. If you need offline review, synchronize the cards to your Anki phone app before you lose connectivity.

## If it does not open

| What you see | What to do |
| --- | --- |
| Page does not connect | Check Tailscale is connected on both devices and the PC is awake. Try mobile data. |
| **Live updates interrupted** or **Workspace refresh interrupted** | Check Tailscale and that the home PC is awake, then choose **Retry connection**. Loaded material may be stale. Unsent drafts stay in this browser; reviews are not queued offline. |
| Old Flashcard Studio instead of Lumen | Include **:8443** in the URL. |
| **502** | The proxy is reachable, but Lumen/WSL is stopped. Use the commands below on the home PC. |
| **403** | Use the same authorized Tailscale account as at home. Lumen's exact origin and user allowlist must match; do not remove the allowlist. |
| Lumen loads but Anki sync fails | Open desktop Anki in **User 1**, resolve its sign-in/sync prompt, and select **Sync now** in Lumen. |
| Reviews from your phone are missing | Sync the Anki phone app first, then use Lumen's **Sync now**. |

## Restarting on the home PC

In **Ubuntu/WSL**:

```sh
systemctl --user restart lumen
systemctl --user status lumen --no-pager
```

Recent server logs:

```sh
journalctl --user -u lumen -n 40 --no-pager
```

In **Windows PowerShell**, if WSL is not running:

```powershell
wsl.exe -d Ubuntu -u lovea --exec /home/lovea/SkillsStudio/scripts/keep-lumen-running.sh
```

That command intentionally stays running. Leave the terminal open; closing it removes this WSL keep-alive process. If the installed Windows startup task is running, it supplies the keep-alive instead.

To inspect the private forwarding, in PowerShell:

```powershell
tailscale serve status
```

You should see the **8443** endpoint forwarding to **http://127.0.0.1:4317**. Port **443** belongs to the older Flashcard Studio and should be left alone.

## What is and is not verified

The host's Tailscale configuration and AnkiConnect connection were checked locally. A real phone-to-home connection over mobile data and your workplace's network rules cannot be tested from this development session; do the short phone test above before leaving.

Tailscale Serve is private to your tailnet, and its background configuration survives restart. Lumen must also be running. The `lumen` Linux user service is installed and running. The Windows **Lumen (WSL)** task is installed, starts at your Windows sign-in, and is running now. The service restarts Lumen after a crash while WSL is alive. WSL's systemd services alone do not keep WSL running; the Windows startup/keep-alive process handles that while you are signed in.

References: [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve), [WSL and systemd](https://learn.microsoft.com/en-us/windows/wsl/systemd), [AnkiWeb synchronization](https://docs.ankiweb.net/syncing.html).
