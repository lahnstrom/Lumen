# Flashcard Studio inside Lumen

This directory contains the authoring engine and editor brought over from the adjacent Flashcard Studio project. Lumen starts the Python service on demand and exposes it at `/studio/` through its existing local/Tailscale access policy. The internal service uses a per-process secret and a loopback-only listener.

## Features retained

- Public webpage extraction, pasted sources, image uploads.
- Selected-passage and whole-source Codex generation, quality flags, generation monitor.
- Manual cloze selection, multiple cloze indices and hints.
- Image occlusion with editable masks and both reveal modes.
- Self-contained `.apkg` export, existing AnkiConnect delivery and explicit collection-sync requests.

Lumen's edition offers Codex subscription and offline modes only. The separately billed API implementation and UI have been removed.

The original standalone Android companion, phone-pairing gateway, and unattended mobile delivery worker remain in the original project. They have not been switched over or restarted. Lumen's integrated editor is available through its own private phone URL.

## Setup and tests

From the Lumen root:

```sh
npm run setup:studio
npm run test:studio
```

Requires Python 3.11+ and `uv`. The service uses `studio/.venv` and starts automatically with the first Studio request. `npm start` does not require a separately running Studio server.

The inherited and integration tests cover Codex credential isolation, section generation, card validation, quality checks, mask editing, AnkiConnect with mocked delivery, and actual `.apkg` import/rendering using Anki's backend. Tests never write to the user's real Anki collection.

## Data

Projects and media live in `data/studio/` (or `LUMEN_DATA_DIR/studio/`). No actual learning content or generated media is checked into Git. Demo assets are bundled in `examples/`.

To copy workspaces from the earlier app, run from the Lumen root:

```sh
npm run import:studio -- /path/to/flashcard_creator/data
```

This reads the original SQLite database and copies projects and referenced images. It skips existing project IDs and never overwrites them. It does not copy API spend accounting, device pairing credentials, or background delivery jobs. After import, treat Lumen's Studio as the authoring copy; there is no automatic two-way synchronization with the original folder.

## Adding drafts to Lumen reviews

Open Studio in a topic to attach cards to that topic, or open Studio from the sidebar to create a topic from a project. Save your edits and click **Add to Lumen reviews**. Only enabled drafts are included. Each cloze number and each mask becomes an independent FSRS card.

Repeat this action after editing: content updates preserve card IDs and scheduling history. Removed/unchecked cards are suspended in Lumen, not deleted; re-enabling and adding again restores their prior history. Studio edits are not pushed automatically into the review queue.

Use **Download .apkg** in Studio to export clozes and masks with media. Lumen's basic TSV export is for plain question/answer cards only.

Back up the whole Lumen `data/` directory, not only `workspace.json`, to preserve Studio projects and media. The JSON backup button covers Lumen topics and review history; it does not embed Studio media or its SQLite database.
