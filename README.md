# Lumen

A local, conversation-led learning workspace powered by your Codex subscription.

## Run

Requires Node.js 22.13+ (Node 24 recommended) and Codex CLI available on PATH.

```sh
npm install
npm run build
npm start
```

Open **http://localhost:4317**. If Codex is not signed in, select **Connect Codex** and complete the ChatGPT sign-in in your browser. You can also run `codex login` first. Lumen requires ChatGPT authentication and does not fall back to an API key. It uses the model configured in your Codex installation, with live web search enabled.

`npm run dev` starts the local server with Vite development middleware and hot reload.

## Try a learning session

1. Create a topic such as “COVID” or “Renal physiology”.
2. Choose **Find sources & a starting point**, or add your own PDF, Markdown, TXT, CSV, link, or notes.
3. Discuss the topic with Lumen. Ask for explanations, retrieval questions, and worked cases.
4. Choose **Build learning kit**. It creates a concept map and flashcards from your conversation and sources. Building again replaces the map and adds new cards, skipping exact duplicate questions.
5. Select a concept to inspect its relationships and source attribution. Use **Edit map** to add and edit concepts, relationships, and sources.
6. Edit cards, then **Review**. Reveal each answer before grading your recall.
7. Select **Anki** to download a TSV. In Anki, import it as Basic notes with Front, Back, and Tags fields. Source attribution is included on the back.

## Data and access

- Topics, messages, extracted source text, graphs, cards, and review history are saved in `data/workspace.json`. Codex stores its own conversation history through its normal local storage.
- Account credentials remain under Codex's management; Lumen does not copy them into its database or browser.
- Source excerpts and your messages are sent to Codex for processing. This is not an offline AI model.
- The server listens on loopback only, allows explicitly configured Tailscale Serve access, blocks other foreign hosts and cross-origin browser requests, and requests a read-only Codex sandbox. Tool approval requests are declined automatically.
- Account details → **Download workspace backup** exports your learning data as JSON. Restore is currently manual: stop the server and replace `data/workspace.json` with a valid backup.
- Set `PORT`, `LUMEN_DATA_DIR`, or `CODEX_BIN` to override the port, storage directory, or Codex executable.
- Do not expose this personal prototype to the public internet.

## Prototype boundaries

- Codex usage limits and model availability apply. No automatic paid API fallback exists. Saved study material and flashcard reviews work without an AI connection.
- Source discovery uses Codex web search. User-added links are marked unverified until discussed; they are not automatically fetched on upload.
- Text PDFs up to 15 MB / 300 pages are supported; scanned PDFs need OCR outside this app. Source context is capped at 45,000 characters per source and 160,000 characters per turn. Large documents should be split into relevant chapters.
- Review scheduling uses **FSRS-6** through the maintained `ts-fsrs` library: 90% target retention, default model weights, learning steps of 1 and 10 minutes, and a 10-minute relearning step. Long intervals include fuzz. The answer buttons show actual scheduling outcomes and learning cards reappear when due.
- This uses the FSRS algorithm available in modern Anki, not Anki’s entire scheduler application. Anki-specific daily limits, day rollover, sibling burying, parameter optimization, and Anki sync are not implemented. TSV export transfers content, not scheduling history.
- Cards persist difficulty, stability, repetitions, lapses, learning state, and complete review logs. Existing cards are migrated by replaying recorded reviews while preserving due dates; a local pre-migration backup is saved. Missing historical reviews cannot be reconstructed, so those cards begin with a new memory estimate.
- Progress measures study activity and recall intervals, not medical competence. Generated facts and source attributions need review.
- The integration uses Codex App Server, an evolving interface. Tested with Codex CLI 0.155.1.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The domain tests cover review scheduling, Anki escaping, source filtering, graph integrity, and duplicate flashcards. Browser tests run with Playwright and require Chromium (`npx playwright install chromium`) and its OS dependencies (`npx playwright install-deps chromium`). They cover the complete manual study workflow, mobile layout, persistence, and request validation. A real ChatGPT-authenticated Codex conversation and structured learning-kit generation were also exercised during development.

## Structure

- `src/`: React interface, Markdown rendering, SVG graph, cards, review, and progress.
- `server/codex.js`: managed Codex App Server subprocess and JSON-RPC transport.
- `server/index.js`: local HTTP API, streamed events, PDF extraction, and persistence.
- `server/domain.js`: learning-bundle application and Anki export.
- `server/scheduler.js`: FSRS configuration, migration, interval previews, and review state.
- `server/access.js`: loopback and authenticated Tailscale Serve access policy.

Official integration reference: https://learn.chatgpt.com/docs/app-server

## Phone access

Use the responsive app over private Tailscale HTTPS. See [phone setup](docs/phone-access.md). Codex stays signed in on the host; your phone shares the same workspace.

Scheduler references: [Anki FSRS options](https://docs.ankiweb.net/deck-options.html#fsrs) and [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).
