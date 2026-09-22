import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from flashcards import codex_backend as backend, monitor, storage
from flashcards.app import app
from flashcards.models import Project


@pytest.fixture(autouse=True)
def isolated(tmp_path,monkeypatch):
    monkeypatch.setattr(storage,'DATA',tmp_path/'data')


def test_live_events_visible_before_process_finishes(tmp_path):
    monitor.begin('project')
    seen=threading.Event()
    def event(data):
        monitor.event('project',data)
        seen.set()
    script='import json,time; print(json.dumps({"type":"turn.started"}),flush=True); time.sleep(.5); print(json.dumps({"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":20}}),flush=True)'
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(backend.run_process,[sys.executable,'-c',script],'',tmp_path,event)
        assert seen.wait(3)
        assert not future.done()
        run=monitor.get('project')
        assert run['state']=='running'
        assert 'processing' in run['events'][-1]['message']
        future.result(timeout=5)
    monitor.finish('project',output={'clozes':[],'occlusions':[]})
    run=monitor.get('project')
    assert run['state']=='completed'
    assert run['usage']=={'input_tokens':100,'output_tokens':20}
    assert json.loads(run['output'])['clozes']==[]


def test_latest_run_persists_and_replaces_previous():
    monitor.begin('p')
    original=monitor.get('p')['id']
    monitor.finish('p',error='Login required.')
    assert monitor.get('p')['state']=='failed'
    assert 'Login required.'==monitor.get('p')['events'][-1]['message']
    monitor.begin('p')
    assert monitor.get('p')['id']!=original
    assert monitor.get('p')['state']=='running'


def test_event_filter_and_text_output():
    monitor.begin('p')
    monitor.event('p',{'type':'item.completed','item':{'type':'reasoning','text':'internal'}})
    monitor.event('p',{'type':'item.completed','item':{'type':'agent_message','text':'Result ready.'}})
    assert 'internal' not in json.dumps(monitor.get('p'))
    assert monitor.get('p')['events'][-1]['message']=='Result ready.'


def test_monitor_endpoint_is_project_scoped():
    project=Project()
    storage.save(project)
    with TestClient(app) as client:
        assert client.get(f'/api/projects/{project.id}/codex-run').json() is None
        monitor.begin(project.id)
        assert client.get(f'/api/projects/{project.id}/codex-run').json()['state']=='running'
        assert client.get('/api/projects/missing/codex-run').status_code==400


def test_auth_failure_is_visible(monkeypatch):
    monkeypatch.setattr(backend,'login_status',lambda:{'ready':False,'message':'Please log in'})
    project=Project()
    with pytest.raises(ValueError):backend.generate_codex(project)
    assert monitor.get(project.id)['state']=='failed'
    assert monitor.get(project.id)['events'][-1]['message']=='Please log in'
