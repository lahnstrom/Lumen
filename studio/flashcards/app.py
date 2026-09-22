import os
import threading
import secrets
from pathlib import Path
from urllib.parse import urlsplit
import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from . import generate, ingest, storage, codex_backend, monitor, anki_connect
from .models import Project
from .export import export_deck

app = FastAPI(title="Lumen Flashcard Studio")
STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")
locks: dict[str, threading.Lock] = {}


@app.middleware("http")
async def local_only(request: Request, call_next):
    if request.url.hostname not in {'127.0.0.1', 'localhost', 'testserver'}:
        return JSONResponse({'detail': 'Local service only.'}, status_code=403)
    token = os.environ.get('LUMEN_STUDIO_TOKEN')
    if token and not secrets.compare_digest(request.headers.get('x-lumen-studio-token', ''), token):
        return JSONResponse({'detail': 'Access Studio through Lumen.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"
    return response


@app.get('/health')
def health():
    return {'ready': True}


@app.exception_handler(ValueError)
async def bad_input(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(httpx.HTTPError)
async def fetch_error(request, exc):
    return JSONResponse({"detail": "Could not fetch this page. It may block automated access. Paste the text and upload images instead."}, status_code=400)


@app.exception_handler(OSError)
async def file_error(request, exc):
    return JSONResponse({"detail": "Network or local file access failed. Check the URL, connection and available disk space."}, status_code=400)


def project_lock(project_id):
    return locks.setdefault(project_id, threading.Lock())


@app.get("/")
def home():
    return FileResponse(STATIC / "index.html")


@app.get("/api/config")
def config():
    return {"ai_ready": False, "codex": codex_backend.login_status()}


@app.get("/api/projects")
def projects():
    return storage.listing()


class ImportRequest(BaseModel):
    url: str = Field(default="", max_length=4000)
    text: str = Field(default="", max_length=60000)
    title: str = Field(default="Untitled page", min_length=1, max_length=200)


@app.post("/api/projects")
def create(body: ImportRequest):
    project = ingest.from_url(body.url) if body.url else Project(title=body.title, text=body.text)
    storage.save(project)
    return project


@app.post("/api/demo")
def demo():
    project = ingest.demo()
    project.clozes = generate.offline(project)
    storage.save(project)
    return project


@app.post("/api/demo/generated")
def generated_demo():
    project = ingest.generated_demo()
    project.clozes = generate.offline(project)
    storage.save(project)
    return project


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    return storage.get(project_id)


@app.put("/api/projects/{project_id}")
def update(project_id: str, project: Project):
    with project_lock(project_id):
        original = storage.get(project_id)
        if project.id != original.id:
            raise ValueError("Project ID cannot change.")
        known = {p.id: p for p in original.images}
        for picture in project.images:
            previous = known.get(picture.id)
            if previous is None or (picture.filename, picture.width, picture.height) != (previous.filename, previous.width, previous.height):
                raise ValueError("Image files and dimensions cannot be changed through this endpoint.")
        storage.save(project)
    return project


@app.post("/api/projects/{project_id}/images")
def upload_image(project_id: str, file: UploadFile = File(...)):
    with project_lock(project_id):
        project = storage.get(project_id)
        if len(project.images) >= 8:
            raise ValueError("Maximum 8 images per page.")
        data = file.file.read(ingest.MAX_BYTES + 1)
        project.images.append(ingest.add_image(data, file.filename or "Uploaded image", project.source))
        storage.save(project)
    return project


@app.get("/api/projects/{project_id}/images/{image_id}")
def image(project_id: str, image_id: str):
    project = storage.get(project_id)
    picture = next((i for i in project.images if i.id == image_id), None)
    if not picture:
        raise HTTPException(404, "Image not found.")
    return FileResponse(storage.media_dir() / picture.filename)


@app.get("/api/projects/{project_id}/codex-run")
def codex_run(project_id: str):
    storage.get(project_id)
    return monitor.get(project_id)


class GenerationRequest(BaseModel):
    mode: str = Field(pattern="^(offline|ai|codex)$")
    section: str | None = Field(default=None, max_length=60000)
    card_count: int | None = Field(default=None, ge=1, le=50)


@app.post("/api/projects/{project_id}/generate")
def make_cards(project_id: str, body: GenerationRequest):
    with project_lock(project_id):
        project = storage.get(project_id)
        remaining = 500 - len(project.clozes)
        if remaining <= 0:
            raise ValueError('This workspace has reached 500 notes. Remove unwanted notes or create another workspace.')
        material = project.model_copy(deep=True)
        material.target_cards = min(body.card_count or project.target_cards, remaining)
        if body.section is not None:
            if not body.section.strip() or body.section not in project.text:
                raise ValueError('Select a nonempty passage from the saved source text.')
            material.text = body.section
            material.images = []
            material.generate_masks = False
        if body.mode == "offline":
            cards = generate.offline(material)[:material.target_cards]
            regions = {}
        elif body.mode == "codex":
            cards, regions = codex_backend.generate_codex(material)
        else:
            raise ValueError("Lumen uses Codex subscription access or offline drafting. API billing is disabled.")
        if not material.generate_masks:
            regions = {}
        # Append new suggestions; never discard a user's existing cards or masks.
        existing = {c.text for c in project.clozes}
        for card in cards:
            if card.text not in existing and len(project.clozes) < 500:
                project.clozes.append(card)
                existing.add(card.text)
        for picture in project.images:
            if picture.id in regions and not picture.regions:
                picture.regions = regions[picture.id]
                picture.ensure_numbers()
                from .quality import inspect_masks
                if inspect_masks(picture):
                    picture.enabled = False
        storage.save(project)
    return project


@app.post("/api/projects/{project_id}/export")
def export(project_id: str):
    data, count = export_deck(storage.get(project_id))
    return Response(data, media_type="application/octet-stream", headers={"Content-Disposition": 'attachment; filename="flashcards.apkg"', "X-Card-Count": str(count)})


@app.post('/api/anki/decks')
def anki_decks():
    return {'decks': anki_connect.decks()}


class AnkiRequest(BaseModel):
    deck: str = Field(min_length=1, max_length=1000)


@app.post('/api/projects/{project_id}/anki')
def send_anki(project_id: str, body: AnkiRequest):
    with project_lock(project_id):
        return anki_connect.send_and_sync(storage.get(project_id), body.deck)
