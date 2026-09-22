import hashlib
import html
import tempfile
from contextlib import contextmanager
from pathlib import Path
from xml.etree import ElementTree as ET
import genanki
from .models import CLOZE
from .storage import media_dir

CSS = """.card{font:22px -apple-system,BlinkMacSystemFont,Arial,sans-serif;text-align:center;color:#183b43;background:#f8faf9;padding:24px}.cloze{font-weight:bold;color:#087d73}.extra{font-size:16px;margin:18px auto;max-width:750px}.source{font-size:12px;opacity:.65;overflow-wrap:anywhere}#io-wrapper{position:relative;display:inline-block;max-width:100%;line-height:0}#io-original img{max-width:100%;height:auto}#io-overlay{position:absolute;inset:0}#io-overlay img{width:100%;height:100%}.nightMode.card{background:#202728;color:#e5eeee}"""


def escaped(text):
    return html.escape(text).replace("\n", "<br>")


def source_html(source):
    safe = escaped(source)
    return f'<a href="{html.escape(source, quote=True)}">{safe}</a>' if source.startswith(("https://", "http://")) else safe


def img(filename):
    return f'<img src="{filename}">'


def models():
    cloze = genanki.Model(1906473821, "Flashcard Studio Cloze", fields=[{"name": n} for n in ["Text", "Extra", "Source"]], templates=[{"name": "Cloze", "qfmt": '{{cloze:Text}}', "afmt": '{{cloze:Text}}<div class="extra">{{Extra}}</div><div class="source">{{Source}}</div>'}], css=CSS, model_type=genanki.Model.CLOZE)
    fields = ["ID (hidden)", "Header", "Image", "Question Mask", "Footer", "Remarks", "Sources", "Extra 1", "Extra 2", "Answer Mask", "Original Mask"]
    def side(mask, answer=False):
        body = '{{#Header}}<div class="extra">{{Header}}</div>{{/Header}}<div id="io-wrapper"><div id="io-original">{{Image}}</div><div id="io-overlay">{{' + mask + '}}</div></div><div class="extra">{{Footer}}</div>'
        if answer:
            body += '<div class="extra">{{Remarks}}</div><div class="extra">{{Extra 1}}</div><div class="extra">{{Extra 2}}</div><div class="source">{{Sources}}</div>'
        return body
    ioe = genanki.Model(1906473822, "Image Occlusion Enhanced", fields=[{"name": n} for n in fields], templates=[{"name": "IO Card", "qfmt": side("Question Mask"), "afmt": side("Answer Mask", True)}], css=CSS)
    return cloze, ioe


def mask_svg(picture, group, active=None, answer=False):
    picture.ensure_numbers()
    root = ET.Element("svg", {"xmlns": "http://www.w3.org/2000/svg", "width": str(picture.width), "height": str(picture.height), "viewBox": f"0 0 {picture.width} {picture.height}"})
    layer = ET.SubElement(root, "g")
    ET.SubElement(layer, "title").text = "Masks"
    for region in picture.regions:
        if active is not None and ((picture.mode == "oa" and (region.id != active or answer)) or (picture.mode == "ao" and answer and region.id == active)):
            continue
        # IOE allocates a range up to this suffix: keep it small, not a UUID integer.
        note_id = f"{group}-{region.number}"
        attrs = {"id": note_id, "x": str(region.x * picture.width), "y": str(region.y * picture.height), "width": str(region.width * picture.width), "height": str(region.height * picture.height), "fill": "#FF7E7E" if region.id == active else "#FFEBA2", "stroke": "#2D2D2D", "stroke-width": "1"}
        if region.id == active:
            attrs["class"] = "qshape"
        ET.SubElement(layer, "rect", attrs)
    return ET.tostring(root, encoding="unicode")


@contextmanager
def deck_content(project):
    cloze_model, ioe_model = models()
    deck_id = int(hashlib.sha256(project.id.encode()).hexdigest()[:8], 16) % (2**31-1)
    deck = genanki.Deck(deck_id, project.title)
    media = []
    count = 0
    for card in project.clozes:
        if not card.enabled:
            continue
        deck.add_note(genanki.Note(model=cloze_model, fields=[escaped(card.text), escaped(card.extra), source_html(project.source)], guid=genanki.guid_for(project.id, card.id), tags=["flashcard_studio", "cloze"]))
        count += len({m[1] for m in CLOZE.finditer(card.text)})
    with tempfile.TemporaryDirectory() as tmp:
        def svg_file(name, body):
            path = Path(tmp) / name
            path.write_text(body, encoding="utf-8")
            media.append(str(path))
            return img(name)
        for picture in project.images:
            if not picture.enabled or not picture.regions:
                continue
            media.append(str(media_dir() / picture.filename))
            group = f"{picture.id}-{picture.mode}"
            original = svg_file(group + "-O.svg", mask_svg(picture, group))
            for region in picture.regions:
                note_id = f"{group}-{region.number}"
                question = svg_file(note_id + "-Q.svg", mask_svg(picture, group, region.id))
                answer = svg_file(note_id + "-A.svg", mask_svg(picture, group, region.id, True))
                fields = [note_id, "Identify the highlighted label.", img(picture.filename), question, "", escaped(region.label), source_html(picture.source or project.source), escaped(picture.caption), "", answer, original]
                deck.add_note(genanki.Note(model=ioe_model, fields=fields, guid=genanki.guid_for(project.id, picture.id, region.id), tags=["flashcard_studio", "image_occlusion"]))
                count += 1
        if not count:
            raise ValueError("Add at least one enabled cloze card or image mask before exporting.")
        for note in deck.notes:
            note.tags.append('flashcard_studio_id_' + hashlib.sha256(note.guid.encode()).hexdigest())
        yield deck, list(dict.fromkeys(media)), count


def export_deck(project):
    with deck_content(project) as (deck, media, count), tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "deck.apkg"
        package = genanki.Package(deck)
        package.media_files = list(dict.fromkeys(media))
        package.write_to_file(str(path))
        return path.read_bytes(), count
