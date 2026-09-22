"""Transparent heuristics for review, not a claim of semantic fact checking."""
import re
from collections import Counter
from .models import CLOZE


def normalized(value):
    return ' '.join(value.casefold().split())


def evidence_text(value):
    value=value.strip()
    for left,right in [('“','”'),('‘','’'),('"','"'),("'","'")]:
        if len(value)>1 and value.startswith(left) and value.endswith(right):
            value=value[1:-1].strip()
            break
    return normalized(value)


def inspect_cloze(card, source_text='', image_ids=()):
    findings = []
    matches = list(CLOZE.finditer(card.text))
    indexes = sorted({m[1] for m in matches}, key=int)
    for index in indexes:
        targets = [m[2].split('::',1)[0].strip() for m in matches if m[1] == index]
        visible = CLOZE.sub(lambda m: (m[2].split('::',1)[1] if '::' in m[2] else '') if m[1] == index else m[2].split('::',1)[0], card.text)
        hidden = ' '.join(targets)
        total_chars = len(hidden.strip()) + len(visible.strip())
        prefix = f'c{index}: '
        if len(targets) > 1:
            findings.append(prefix + 'Several blanks are hidden together. Confirm they test one fact; otherwise use separate cards.')
        if len(hidden.split()) > 12 or len(hidden) > 120:
            findings.append(prefix + 'Long answer. Split it into smaller recall targets.')
        if total_chars and len(hidden) / total_chars > .6:
            findings.append(prefix + 'Most of the statement is hidden. Leave a more specific cue visible.')
        if len(re.sub(r'\W', '', visible)) < 12:
            findings.append(prefix + 'Very little context remains. Name the subject and relation being tested.')
        if re.fullmatch(r'[\w\s-]{1,80}\b(?:occurs?|happens?|can occur|takes place|is|are)\s*[.!?]?', visible.strip(), re.I):
            findings.append(prefix + 'Open-ended cue. Specify the requested relation (for example location or temperature), or add a category hint.')
        for target in targets:
            if len(target) >= 3 and re.search(r'(?<!\w)' + re.escape(target) + r'(?!\w)', visible, flags=re.I):
                findings.append(prefix + 'The answer also appears in the visible text.')
        for match in matches:
            if match[1] != index:
                continue
            parts = match[2].split('::',1)
            if len(parts)==2 and normalized(parts[0]) in normalized(parts[1]):
                findings.append(prefix + 'The hint contains the answer.')
    if card.evidence:
        evidence = evidence_text(card.evidence)
        valid_image = card.evidence.strip().removeprefix('Image: ').strip() in image_ids and card.evidence.startswith('Image: ')
        if not valid_image and evidence not in normalized(source_text):
            findings.append('Supporting evidence could not be matched to the supplied text or image IDs. Verify the fact.')
    else:
        findings.append('No supporting evidence supplied. Verify against the source.')
    return list(dict.fromkeys(findings))


def inspect_masks(picture):
    findings=[]
    labels=Counter(normalized(r.label) for r in picture.regions if r.label.strip())
    for region in picture.regions:
        if region.width * region.height > .2:
            findings.append(f'Mask {region.number}: covers over 20% of the image; check that identifying context remains visible.')
        if labels[normalized(region.label)] > 1:
            findings.append(f'Mask {region.number}: repeated answer label; check for answer leakage, especially in hide-one mode.')
    for index,a in enumerate(picture.regions):
        for b in picture.regions[index+1:]:
            overlap=max(0,min(a.x+a.width,b.x+b.width)-max(a.x,b.x))*max(0,min(a.y+a.height,b.y+b.height)-max(a.y,b.y))
            if overlap > min(a.width*a.height,b.width*b.height)*.15:
                findings.append(f'Masks {a.number} and {b.number} overlap. Another mask may cover the revealed answer; redraw or use hide-one mode.')
    return findings


def refresh_project(project):
    for card in project.clozes:
        card.review_notes = inspect_cloze(card, project.text, {i.id for i in project.images})
    for picture in project.images:
        picture.review_notes = inspect_masks(picture)
