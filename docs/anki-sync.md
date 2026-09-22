# One review history across Lumen and Anki

Open a learning space → **Flashcards → Connect Anki**. Keep desktop Anki running with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) installed and signed into AnkiWeb. Choose an existing deck or accept `Lumen::<space name>`, then connect. Repeat once for each space you want linked.

The bridge reads your active profile and binds to it. Switching profiles pauses synchronization; it never switches profiles for you. Credentials remain in Anki. AnkiConnect remains on the host's loopback interface, including the Windows loopback bridge when Lumen runs in WSL. Phones access Lumen through Tailscale, not AnkiConnect directly.

## What happens automatically

- New enabled cards in a connected space are published. Native notes use the Lumen note type; Studio cloze notes and image masks retain their export identities and media.
- Studio notes previously exported with their identity tags are adopted. Native cards created by older plain TSV exports have no stable Lumen identity and are **not** matched by guessing similar text. Avoid importing a second TSV after connecting.
- Every 15 seconds, Lumen reads Anki's current card state and review logs. Due cards, review counts, intervals, suspension and burial reflect desktop Anki. Undoing a review in Anki removes that imported attempt from Lumen as well.
- Anki's scheduler supplies the button intervals and commits answers. Lumen never also applies local FSRS to a linked card.
- Normal AnkiWeb sync is requested every two minutes and after Lumen answers. Phone reviews appear after the phone and desktop collections synchronize. Click **Sync now** to request an immediate refresh.
- Lumen can display basic, cloze and image-occlusion templates. Template HTML is isolated in a sandbox without JavaScript; media comes through authenticated Lumen routes.

AnkiWeb synchronization requires a working desktop Anki connection and AnkiWeb authentication. A successful request is not a promise that a background cloud sync has finished. If Anki requires a full upload/download decision, resolve that in Anki; Lumen never makes the choice automatically.

## Existing history and schedule handover

Existing Anki notes retain their schedule and history. New notes start with Anki's schedule. Old Lumen attempts remain in Lumen as historical activity; they are not replayed into Anki or presented as past Anki reviews. The earlier local FSRS snapshot is retained in the card's linkage record. Review counts include those earlier local attempts plus Anki's current repetitions.

This means connecting a previously studied local card can make it a new card in Anki. The connection screen explains this before you enable it. A faithful historical FSRS migration between the two schedulers is not implemented.

Lumen's queue shows all due/new **linked** cards. It does not reproduce Anki's daily deck limits, queue ordering, or automatic sibling burial. Anki's scheduling algorithm and interval settings still determine each submitted answer. Suspended and buried cards already marked in Anki are excluded.

## Failure and editing behavior

Lumen serializes its Anki operations and rejects duplicate/expired answer tokens. It checks for changes before grading, writes a pending-answer record before contacting Anki, and reconciles the actual review log after an interrupted request. It never automatically retries an ambiguous answer. If a successful answer cannot be confirmed, reconnect and sync before continuing. Review history imports are idempotent.

If Anki is unavailable, Lumen shows the last known state and blocks grading linked cards. It does not create a competing offline schedule. Use an Anki mobile app for offline study and synchronize it later.

Deleted Anki cards are marked missing, not automatically recreated. Removing/suspending a draft in Lumen excludes it locally; it does not delete or suspend the corresponding Anki note. Resolve deletions and suspension in Anki when you want them to apply there too.

Local content edits are sent if the remote note has not also changed. If both sides changed, Anki's contents are used for linked reviews and Lumen retains the local edit, showing a conflict notice. **Keep Anki versions** acknowledges the remote versions without erasing the retained local draft; later deliberate local edits can be sent again. This is review synchronization, not a general two-way note editor. Duplicate identity tags are reported rather than guessed.

Data lives in `data/workspace.json`; back up the entire `data/` folder for Studio images as well. The backup includes linkage and imported logs. Do not independently edit the same Anki card simultaneously in two live review sessions.

## Validation

Unit tests cover adoption, duplicate prevention, external reviews, undo, suspension, missing cards, profile changes, content conflicts, interrupted answers and cloud failures. A separate integration test uses a disposable real Anki collection and its scheduler, including Studio cloze and image-occlusion cards. Browser tests cover setup, error presentation, isolated template rendering, and saved review status. Tests never send test cards to the user's AnkiWeb account.
