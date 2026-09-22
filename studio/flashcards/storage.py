import json
import os
import sqlite3
from pathlib import Path
from .models import Project

DATA = Path(os.environ.get("FLASHCARD_DATA", "data")).resolve()
def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / "studio.sqlite", timeout=30)
    db.execute("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, body TEXT NOT NULL)")
    return db


def save(project):
    from .quality import refresh_project
    for picture in project.images:
        picture.ensure_numbers()
    refresh_project(project)
    with connect() as db:
        db.execute("INSERT OR REPLACE INTO projects VALUES (?, ?)", (project.id, project.model_dump_json()))


def get(project_id):
    with connect() as db:
        row = db.execute("SELECT body FROM projects WHERE id=?", (project_id,)).fetchone()
    if not row:
        raise ValueError("Project not found.")
    return Project.model_validate_json(row[0])


def listing():
    with connect() as db:
        rows = db.execute("SELECT body FROM projects ORDER BY rowid DESC").fetchall()
    return [{"id": p["id"], "title": p["title"]} for row in rows for p in [json.loads(row[0])]]


def media_dir():
    path = DATA / "media"
    path.mkdir(parents=True, exist_ok=True)
    return path
