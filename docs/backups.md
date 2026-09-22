# Backing up Lumen

Open **Codex connected → Download complete archive**. Save the ZIP somewhere separate from the home PC. Let conversations and Studio generation finish, and pause editing while it is prepared. Lumen and Studio are separate snapshots, not one cross-app transaction.

The archive contains:

- `data/workspace.json`: saved topics, source text, conversation messages, native cards, graph connections, Anki links, and review records.
- `data/studio/studio.sqlite`, if present: saved Studio projects and run records.
- `data/studio/media/`, if present: saved Studio images.
- `manifest.json`: file sizes and SHA-256 checksums.
- `RESTORE.txt`: restore instructions.

The exporter uses [SQLite's online backup API](https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup), including committed changes in the write-ahead log. It does not copy the live database file directly. A changed media file or symbolic link causes export to fail so you can fix it and retry.

The ZIP contains your study material and conversations: keep it private. It excludes `.env`, Codex authentication and thread storage, Anki's collection, browser drafts, and original PDFs after text extraction. Back up Anki separately through Anki. On a new host, install Lumen's dependencies and set up Codex, Anki, and Tailscale separately. The exported conversation text remains readable, but starting a new Codex thread may be necessary on a different host.

**Study records only (JSON)** remains available for a smaller export. It does not contain Studio projects or images.

## Verify and restore

From the Lumen project directory, verify the ZIP before using it:

```sh
python3 scripts/workspace-backup.py verify /path/to/lumen-workspace-YYYY-MM-DD.zip
```

Verification reads the archive, validates its file paths and checksums, and prints counts. It never changes your workspace. Checksums detect corruption; they do not establish who created an archive.

1. Stop Lumen with `systemctl --user stop lumen`. Stop any other process using this data directory too.
2. Make a separate copy of the current `data/` directory. Keep it until you have checked the restored workspace.
3. Extract the verified archive into a separate empty directory. Replace the stopped app's data with that archive's `data/` directory; do not merge the new database into an old directory with leftover SQLite WAL files. If you use `LUMEN_DATA_DIR`, restore there instead of the default `data/`.
4. Start Lumen with `systemctl --user start lumen` and check topics, cards, and Studio projects.
5. Reconnect the original Anki profile before syncing linked cards. Restoring Lumen does not roll back Anki or AnkiWeb; synchronization will refresh linked review state from Anki.

There is deliberately no automatic restore over a running workspace. Copying the archive back replaces data created since it was exported, so retain your pre-restore copy.
