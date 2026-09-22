import pytest
from flashcards.models import Cloze, Picture, Region
from flashcards.quality import inspect_cloze, inspect_masks
from flashcards.generate import parse_suggestions


@pytest.mark.parametrize('text',[
    '{{c1::Evaporation}} is the conversion of liquid water into water vapour.',
    'At standard atmospheric pressure, pure water boils at {{c1::100}} °C.',
    'In the water cycle, {{c1::solar energy}} drives evaporation.',
])
def test_focused_clozes_pass(text):
    evidence='Supported source excerpt.'
    assert not inspect_cloze(Cloze(text=text,evidence=evidence),evidence)


@pytest.mark.parametrize('text,expected',[
    ('{{c1::Everything in this sentence is hidden from the learner.}}','Most of'),
    ('The phases are {{c1::first prepare all the material then combine it and wait until the final product appears}}.','Long answer'),
    ('{{c1::Evaporation}} is evaporation of liquid water into the air.','visible text'),
    ('In the water cycle, {{c1::evaporation::evaporation process}} converts liquid water into vapour.','hint contains'),
    ('{{c1::Solar energy}} drives {{c1::evaporation}} in the water cycle.','Several blanks'),
    ('It is {{c1::evaporation}}.','Very little context'),
    ('Evaporation occurs {{c1::at the surface of a liquid}}.','Open-ended cue'),
    ('Evaporation can occur {{c1::below the boiling point}}.','Open-ended cue'),
])
def test_unhelpful_hidden_information_flagged(text,expected):
    assert any(expected in message for message in inspect_cloze(Cloze(text=text)))


def test_each_anki_index_is_checked_independently():
    text='At standard atmospheric pressure, water boils at {{c1::100}} °C and freezes at {{c2::0}} °C.'
    assert not inspect_cloze(Cloze(text=text,evidence='Source'), 'Source')


def test_category_hint_can_resolve_open_ended_cue():
    c=Cloze(text='Evaporation occurs {{c1::at the surface of a liquid::location}}.',evidence='Source')
    assert not inspect_cloze(c,'Source')


def test_generated_bad_cards_excluded_but_kept_for_review():
    cards,_=parse_suggestions({'clozes':[{'text':'{{c1::An entire explanation with no context left visible.}}','extra':'','evidence':'Source'}],'occlusions':[]},[],'Source')
    assert not cards[0].enabled
    assert cards[0].review_notes


def test_source_quote_must_match():
    c=Cloze(text='The capital of France is {{c1::Paris}}.',evidence='Invented quote')
    assert any('could not be matched' in n for n in inspect_cloze(c,'Actual text'))


def test_wrapping_quotes_do_not_invalidate_exact_evidence():
    c=Cloze(text='A triangle has {{c1::three}} sides.',evidence='“A triangle has three sides.”')
    assert not inspect_cloze(c,'A triangle has three sides.')


def test_overlapping_masks_flagged():
    pic=Picture(filename='a'*32+'.png',width=1000,height=1000,regions=[Region(x=.1,y=.1,width=.2,height=.1,label='A'),Region(x=.15,y=.1,width=.2,height=.1,label='B')])
    assert any('overlap' in n for n in inspect_masks(pic))
