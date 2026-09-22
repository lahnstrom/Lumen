"""The latest Codex run per workspace, available while the subprocess is running."""
import json
import time
import uuid
from .storage import connect


def database():
    db=connect()
    db.execute('CREATE TABLE IF NOT EXISTS codex_runs (project TEXT PRIMARY KEY, body TEXT NOT NULL)')
    return db


def begin(project_id):
    run={'id':uuid.uuid4().hex,'project_id':project_id,'state':'running','started_at':time.time(),
         'finished_at':None,'events':[],'output':'','usage':{}}
    with database() as db:
        db.execute('INSERT OR REPLACE INTO codex_runs VALUES (?,?)',(project_id,json.dumps(run)))
    append(project_id,'Starting Codex with your ChatGPT login.')


def change(project_id,fn):
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT body FROM codex_runs WHERE project=?',(project_id,)).fetchone()
        if not row:return
        run=json.loads(row[0])
        fn(run)
        db.execute('UPDATE codex_runs SET body=? WHERE project=?',(json.dumps(run),project_id))


def append(project_id,message):
    def update(run):
        run['events'].append({'time':time.time(),'message':message[:2000]})
        run['events']=run['events'][-100:]
    change(project_id,update)


def event(project_id,data):
    kind=data.get('type')
    if kind=='thread.started':append(project_id,'Codex session started.')
    elif kind=='turn.started':append(project_id,'Model is processing the source and image attachments.')
    elif kind=='turn.completed':
        usage={k:v for k,v in data.get('usage',{}).items() if k in {'input_tokens','output_tokens','cached_input_tokens'} and isinstance(v,int)}
        change(project_id,lambda run:run.update(usage=usage))
        append(project_id,'Model response complete. Validating the card data…')
    elif kind in {'error','turn.failed'}:append(project_id,'Codex reported an error. Waiting for the worker result…')
    elif kind=='item.completed' and data.get('item',{}).get('type')=='agent_message':
        text=data['item'].get('text','')
        if not isinstance(text,str):return
        try:
            parsed=json.loads(text)
        except ValueError:
            append(project_id,text)
        else:
            change(project_id,lambda run:run.update(output=json.dumps(parsed,ensure_ascii=False,indent=2)[:200000]))
            append(project_id,'Received structured flashcard output.')


def finish(project_id,error=None,output=None):
    def update(run):
        run['state']='failed' if error else 'completed'
        run['finished_at']=time.time()
        if output is not None:run['output']=json.dumps(output,ensure_ascii=False,indent=2)[:200000]
        run['events'].append({'time':time.time(),'message':error or 'Card validation finished. Drafts are ready for review.'})
    change(project_id,update)


def get(project_id):
    with database() as db:
        row=db.execute('SELECT body FROM codex_runs WHERE project=?',(project_id,)).fetchone()
    if not row:return None
    run=json.loads(row[0])
    run['elapsed_seconds']=round(max(0,(run['finished_at'] or time.time())-run['started_at']),1)
    if run['state']=='running' and run['elapsed_seconds']>360:
        run['state']='interrupted'
    return run
