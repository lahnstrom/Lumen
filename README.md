# Lumen

A local, conversation-led learning workspace powered by your Codex subscription.

## Run

Requires Node.js 22.13+ (Node 24 recommended) and Codex CLI available on PATH. The integrated Flashcard Studio also requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```sh
npm install
npm run setup:studio
npm run build
npm start
```

Open **http://localhost:4317**. If Codex is not signed in, select **Connect Codex** and complete the ChatGPT sign-in in your browser. You can also run `codex login` first. Lumen requires ChatGPT authentication and does not fall back to an API key. It uses the model configured in your Codex installation, with live web search enabled.

`npm run dev` starts the local server with Vite development middleware and hot reload.

## Try a learning session

1. Create a topic such as “COVID” or “Renal physiology”.
2. Choose **Find sources & a starting point**, or add your own PDF, Markdown, TXT, CSV, link, or notes.
3. Discuss the topic with Lumen. Ask for explanations, retrieval questions, and worked cases. Unsent drafts are saved per topic in the current browser; switching topics or reloading preserves them. A failed send leaves the draft intact. Drafts are local to that device and are not included in server backups.
4. Choose **Build learning kit**. It creates a concept map and flashcards from your conversation and sources. Building again replaces the map and adds new cards, skipping exact duplicate questions.
5. Explore the **Concept map** with zoom, pan, search, automatic arrangement and saved positions. Select a concept to inspect relationships, attach flashcards or connect a concept from another space. **Knowledge atlas** shows those spaces together. Cross-space relationships can carry a source title or URL; select a connection to edit its wording or source. You can unlink a flashcard without deleting it or its review history. **Export Obsidian canvas** downloads a portable `.canvas` file including relationship sources. Use **Edit map** to edit the concepts themselves.
6. Search your flashcards by question, answer, or source; filter by ready, new, practised, paused, or unavailable status. Answers stay hidden until requested, and browsing does not record reviews. Edit cards, then **Review** to open a dedicated, phone-friendly page at `/review/<topic-id>`. Reveal each answer before grading your recall. You can reload or bookmark the page; saved scheduling persists, and learning cards return automatically when due. **Back to flashcards** returns to the topic.
7. Open **Studio** for cloze editing, image occlusion, and `.apkg` export. Use **Use topic sources** to start from your material; **Add to Lumen reviews** connects enabled drafts to this topic’s FSRS queue. Existing Studio workspaces are also available from the sidebar.
8. Choose **Connect Anki** on the Flashcards tab for automatic review synchronization. Or select **Anki** to download a TSV. In Anki, import it as Basic notes with Front, Back, and Tags fields. Source attribution is included on the back.

## Data and access

- Topics, messages, extracted source text, graphs, cards, and review history are saved in `data/workspace.json`. Codex stores its own conversation history through its normal local storage.
- Account credentials remain under Codex's management; Lumen does not copy them into its database or browser.
- Source excerpts and your messages are sent to Codex for processing. This is not an offline AI model.
- The server listens on loopback only, allows explicitly configured Tailscale Serve access, blocks other foreign hosts and cross-origin browser requests, and requests a read-only Codex sandbox. Tool approval requests are declined automatically.
- **Codex connected → Download complete archive** exports saved Lumen records, Studio projects, and images in a ZIP with checksums and restore instructions. A smaller JSON export remains available. See [backup and restore instructions](docs/backups.md) for exclusions and the manual restore procedure.
- Set `PORT`, `LUMEN_DATA_DIR`, or `CODEX_BIN` to override the port, storage directory, or Codex executable.
- Do not expose this personal prototype to the public internet.

## Prototype boundaries

- Codex usage limits and model availability apply. No automatic paid API fallback exists. Saved study material and flashcard reviews work without an AI connection.
- Source discovery uses Codex web search. User-added links are marked unverified until discussed; they are not automatically fetched on upload.
- Text PDFs up to 15 MB / 300 pages are supported; scanned PDFs need OCR outside this app. Source context is capped at 45,000 characters per source and 160,000 characters per turn. Large documents should be split into relevant chapters.
- Review scheduling uses **FSRS-6** through the maintained `ts-fsrs` library: 90% target retention, default model weights, learning steps of 1 and 10 minutes, and a 10-minute relearning step. Long intervals include fuzz. The answer buttons show actual scheduling outcomes and learning cards reappear when due.
- This uses the FSRS algorithm available in modern Anki, not Anki’s entire scheduler application. Anki-specific daily limits, day rollover, sibling burying, and parameter optimization are not implemented. Connected topics use desktop Anki through AnkiConnect as their scheduling authority. Review logs, due status, suspension and undo are reflected in Lumen automatically. See [Anki synchronization](docs/anki-sync.md) for setup, migration boundaries and offline behavior. Unconnected topics continue to use local FSRS. TSV export transfers content, not scheduling history.
- Cards persist difficulty, stability, repetitions, lapses, learning state, and complete review logs. Existing cards are migrated by replaying recorded reviews while preserving due dates; a local pre-migration backup is saved. Missing historical reviews cannot be reconstructed, so those cards begin with a new memory estimate.
- Progress measures study activity and recall intervals, not medical competence. Generated facts and source attributions need review.
- The integration uses Codex App Server, an evolving interface. Tested with Codex CLI 0.155.1.

## Validation

```sh
npm test
npm run build
npm run test:e2e
npm run test:studio
```

The domain tests cover review scheduling, Anki escaping, source filtering, graph integrity, and duplicate flashcards. Browser tests run with Playwright and require Chromium (`npx playwright install chromium`) and its OS dependencies (`npx playwright install-deps chromium`). They cover the complete manual study workflow, mobile layout, persistence, and request validation. A real ChatGPT-authenticated Codex conversation and structured learning-kit generation were also exercised during development.

## Structure

- `src/`: React interface, Markdown rendering, React Flow concept explorer, cards, review, and progress.
- `server/anki.js`: serialized AnkiConnect synchronization, stable identities, review reconciliation and answer confirmation.
- `server/graph.js`: graph layout/card-link validation and cross-space relationships.
- `server/codex.js`: managed Codex App Server subprocess and JSON-RPC transport.
- `server/index.js`: local HTTP API, streamed events, PDF extraction, and persistence.
- `server/domain.js`: learning-bundle application and Anki export.
- `server/scheduler.js`: FSRS configuration, migration, interval previews, and review state.
- `server/access.js`: loopback and authenticated Tailscale Serve access policy.

Official integration reference: https://learn.chatgpt.com/docs/app-server

## Phone access

For this home computer, start with [the morning checklist](READ-ME-TOMORROW.md). Use the responsive app over private Tailscale HTTPS. See [phone setup](docs/phone-access.md). Codex stays signed in on the host; your phone shares the same workspace.

Scheduler references: [Anki FSRS options](https://docs.ankiweb.net/deck-options.html#fsrs) and [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

## Integrated Studio and chat-created cards

[Studio integration details](studio/README.md) describe saved-workspace import, media storage, and the review bridge. The original standalone Android/background-delivery app is left intact; this integration brings the authoring editor into Lumen.

Requests such as “make flashcards from this” now save cards directly from the conversation and display a **flashcards saved** shortcut. Every response uses a structured envelope internally; only its human-readable reply is shown. On startup, Lumen recovers valid card envelopes left as raw JSON by the earlier chat bug, making a local backup first and avoiding duplicate questions.


## Running reliably on this Windows/WSL host

`scripts/install-user-service.sh` installs the `lumen` systemd user service using the current Node executable. Stop an existing manual server on port 4317 before starting it. The service restarts after failures and reads the same ignored `.env` and `data/` directory.

`scripts/install-windows-startup.ps1` installs a normal-user Windows sign-in task that keeps Ubuntu running and starts that service. This helper is specific to the current `Ubuntu` distribution and repository path. Copy it to a local Windows folder before running it if PowerShell treats WSL UNC paths as remote unsigned scripts. It does not change execution policy, firewall rules, or power settings. Remove the task with `Unregister-ScheduledTask -TaskName 'Lumen (WSL)'` and the Linux service with `systemctl --user disable --now lumen`.

Additional validation: `npm run test:anki` exercises native, cloze and image-occlusion reviews against a disposable **real Anki collection**, without touching desktop Anki or AnkiWeb. Run `npm run setup:studio` first to install its Python dependencies.
