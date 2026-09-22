import re
import uuid
from typing import Literal
from pydantic import BaseModel, Field, model_validator


def uid():
    return uuid.uuid4().hex


CLOZE = re.compile(r"\{\{c([1-9]\d*)::([^{}]+?)\}\}")


class Cloze(BaseModel):
    id: str = Field(default_factory=uid, pattern=r"^[a-f0-9]{32}$")
    text: str = Field(max_length=4000)
    extra: str = Field(default="", max_length=4000)
    evidence: str = Field(default="", max_length=4000)
    enabled: bool = True
    review_notes: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_cloze(self):
        matches = list(CLOZE.finditer(self.text))
        if not matches or any(int(m[1]) > 99 or not m[2].split("::")[0].strip() for m in matches):
            raise ValueError("Use a nonempty Anki cloze, e.g. {{c1::answer}}, with indices 1–99.")
        remainder = CLOZE.sub("", self.text)
        if "{{" in remainder or "}}" in remainder:
            raise ValueError("Malformed or nested cloze markers.")
        return self


class Region(BaseModel):
    id: str = Field(default_factory=uid, pattern=r"^[a-f0-9]{32}$")
    number: int = Field(default=0, ge=0, le=10000)
    x: float = Field(ge=0, lt=1)
    y: float = Field(ge=0, lt=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    label: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def within_image(self):
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("Mask must fit inside the image.")
        return self


class Picture(BaseModel):
    id: str = Field(default_factory=uid, pattern=r"^[a-f0-9]{32}$")
    filename: str = Field(pattern=r"^[a-f0-9]{32}\.png$")
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    caption: str = Field(default="", max_length=2000)
    source: str = Field(default="", max_length=4000)
    regions: list[Region] = Field(default_factory=list, max_length=60)
    mode: Literal["ao", "oa"] = "ao"
    enabled: bool = True
    review_notes: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def ensure_numbers(self):
        assigned = [r.number for r in self.regions if r.number]
        if len(assigned) != len(set(assigned)):
            raise ValueError("Mask numbers must be unique within an image.")
        next_number = max(assigned, default=0) + 1
        for region in self.regions:
            if not region.number:
                if next_number > 10000:
                    raise ValueError("Mask numbering exhausted; create a new image.")
                region.number = next_number
                next_number += 1
        return self


class Project(BaseModel):
    id: str = Field(default_factory=uid, pattern=r"^[a-f0-9]{32}$")
    title: str = Field(default="Untitled page", min_length=1, max_length=200)
    source: str = Field(default="", max_length=4000)
    text: str = Field(default="", max_length=60000)
    clozes: list[Cloze] = Field(default_factory=list, max_length=500)
    generate_masks: bool = True
    target_cards: int = Field(default=20, ge=1, le=50)
    images: list[Picture] = Field(default_factory=list, max_length=8)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [c.id for c in self.clozes] + [i.id for i in self.images]
        ids += [r.id for i in self.images for r in i.regions]
        if len(ids) != len(set(ids)):
            raise ValueError("Card and image IDs must be unique.")
        return self
