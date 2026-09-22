const $ = s => document.querySelector(s);
let project = null, dirty = false, busy = false;
let config = null;
let monitorTimer = null, monitorProject = null, monitorRun = null, monitorIgnore = null, monitorPending = false, monitorAwaiting = false;
const views = new Map();
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep source reading in the wide review column, separate from drafting settings.
$('#source-editor-slot').append(document.querySelector('label[for="source-text"]'), $('#source-text'));
let sourceSelection = '';
function selectedSource() {
  const el = $('#source-text');
  sourceSelection = el.value.slice(el.selectionStart, el.selectionEnd).trim();
  $('#selection-info').textContent = sourceSelection ? `${sourceSelection.split(/\s+/).length} words selected` : 'No passage selected.';
}
['select','keyup','mouseup','input'].forEach(event => $('#source-text').addEventListener(event, selectedSource));

async function api(path, body, method = 'POST', signal = undefined) {
  const options = body === undefined ? {} : {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)};
  if(signal)options.signal=signal;
  const res = await fetch('/studio/api' + path, options);
  if (!res.ok) {const data = await res.json(); throw Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));}
  return res.json();
}
function status(message, error = false) {$('#status').textContent = message; $('#status').className = error ? 'error' : '';}
function changed() {dirty = true; $('#save-state').textContent = 'Unsaved changes';}
async function action(fn) {
  if (busy) return;
  busy = true;
  // Disable editing during requests to prevent a response overwriting fresh edits.
  const controls = [...document.querySelectorAll('button,input,textarea,select')];
  const was = controls.map(c => c.disabled);
  controls.forEach(c => c.disabled = true);
  $('#workspace').inert = true;
  try {await fn();} catch(e) {status(e.message, true);} finally {
    controls.forEach((c,i) => c.disabled = was[i]);
    $('#workspace').inert = false;
    busy = false;
  }
}
async function refreshList() {const items = await api('/projects'); $('#projects').innerHTML = '<option value="">Open a previous workspace…</option>' + items.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('');}
async function refreshMonitor(id) {
  if (monitorPending || monitorProject !== id) return;
  monitorPending = true;
  try {
    const run = await api(`/projects/${id}/codex-run`,undefined,'GET',AbortSignal.timeout(5000));
    if (monitorProject !== id) return;
    if (!run) {
      if(!monitorAwaiting){clearInterval(monitorTimer);monitorTimer=null;}
      return;
    }
    if(run.id === monitorIgnore)return;
    monitorAwaiting=false;
    monitorRun = run.id; monitorIgnore = null;
    $('#codex-monitor').hidden = false;
    $('#codex-run-state').textContent = `${run.state} · ${Math.round(run.elapsed_seconds)}s`;
    const log = $('#codex-events');
    const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.textContent = run.events.map(e=>`${new Date(e.time*1000).toLocaleTimeString()}  ${e.message}`).join('\n');
    if(atEnd)log.scrollTop=log.scrollHeight;
    $('#codex-output').textContent = run.output;
    $('#codex-result').hidden = !run.output;
    const usage = run.usage || {};
    $('#codex-usage').textContent = Object.keys(usage).length ? `Tokens: ${usage.input_tokens ?? '—'} input · ${usage.cached_input_tokens ?? '—'} cached input · ${usage.output_tokens ?? '—'} output. This is usage, not a dollar charge.` : '';
    if(run.state !== 'running'){clearInterval(monitorTimer);monitorTimer=null;}
  } catch(e) {
    if(monitorProject===id)$('#codex-run-state').textContent='Reconnecting to the local monitor…';
  } finally {monitorPending=false;}
}
function startMonitor(id, fresh=false) {
  clearInterval(monitorTimer);
  const sameProject=monitorProject===id;
  monitorIgnore=fresh&&sameProject?monitorRun:null;
  monitorAwaiting=fresh;
  monitorProject=id;
  if(!sameProject)monitorRun=null;
  if(fresh || !sameProject){
    $('#codex-events').textContent='';$('#codex-output').textContent='';$('#codex-usage').textContent='';
    $('#codex-result').hidden=true;$('#codex-result').open=false;
    $('#codex-monitor').hidden=!fresh;
    $('#codex-run-state').textContent='Starting…';
  }
  monitorTimer=setInterval(()=>refreshMonitor(id),1000);
  refreshMonitor(id);
  if(fresh)$('#codex-monitor').scrollIntoView({behavior:'smooth',block:'center'});
}
async function save() {
  if (!project) return;
  project.title = $('#title').value.trim() || 'Untitled page';
  project.source = $('#source').value;
  project.text = $('#source-text').value;
  project.generate_masks = $('#generate-masks').checked;
  const target = Number($('#target-cards').value);
  if (!Number.isInteger(target) || target < 1 || target > 50) throw Error('Choose a target between 1 and 50 cloze notes.');
  project.target_cards = target;
  project = await api('/projects/' + project.id, project, 'PUT');
  renderClozes(); renderImages();
  dirty = false; $('#save-state').textContent = 'Saved locally';
}
async function cost() {
  const codex = $('#mode').value === 'codex';
  $('#ai-status').textContent = codex ? (config?.codex?.message || 'Checking Codex login…') : 'Local definition extraction. No model requests.';
  $('#budget-label').textContent = codex ? 'Uses your Codex subscription' : 'Offline mode';
  $('#estimate').textContent = codex ? 'No API key' : 'Local';
  $('#spend').textContent = codex ? 'Your existing Codex allowance applies. Generated drafts need your review.' : 'Draw masks and edit clozes without an AI connection.';
}
async function openProject(p) {
  project = p; dirty = false; views.clear();
  $('#workspace').hidden = false;
  $('#title').value = p.title; $('#source').value = p.source; $('#source-text').value = p.text;
  $('#generate-masks').checked = p.generate_masks ?? true;
  $('#target-cards').value = p.target_cards ?? 20;
  sourceSelection = ''; $('#selection-info').textContent = 'No passage selected.';
  $('#save-state').textContent = 'Saved locally';
  $('#warnings').textContent = p.warnings.join(' ');
  startMonitor(p.id);
  renderClozes(); renderImages(); await cost(); await refreshList();
  $('#workspace').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderClozes() {
  $('#cloze-count').textContent = project.clozes.filter(c=>c.enabled).length;
  $('#clozes').innerHTML = '';
  if (!project.clozes.length) $('#clozes').innerHTML = '<div class="empty">Your next small discovery starts here. Suggest cards or add one.</div>';
  project.clozes.forEach((card, index) => {
    const div = document.createElement('article'); div.className = 'cloze-card';
    div.innerHTML = `<div class="card-top"><label class="check"><input type="checkbox" ${card.enabled?'checked':''}>CARD ${String(index+1).padStart(2,'0')}</label><button class="quiet remove">Remove</button></div><textarea aria-label="Cloze text ${index+1}">${esc(card.text)}</textarea><div class="card-preview"></div><button class="quiet reveal">Reveal answer</button><details><summary>Context & supporting evidence</summary><label>EXTRA CONTEXT</label><textarea class="extra">${esc(card.extra)}</textarea><p>${esc(card.evidence || 'Manually authored — verify against your source.')}</p></details>`;
    const preview = div.querySelector('.card-preview'); let reveal = false, activeIndex = null;
    const selector = document.createElement('select'); selector.setAttribute('aria-label',`Preview cloze number ${index+1}`); preview.before(selector);
    const hiddenInfo = document.createElement('p'); hiddenInfo.className='hint'; preview.after(hiddenInfo);
    const review = document.createElement('p'); review.className='quality-warning'; review.textContent=(card.review_notes || []).join(' '); review.hidden=!review.textContent; div.append(review);
    function drawPreview(){
      const matches=[...card.text.matchAll(/\{\{c([1-9]\d*)::([^{}]+?)\}\}/g)];
      const indices=[...new Set(matches.map(m=>m[1]))].sort((a,b)=>Number(a)-Number(b));
      if(!indices.includes(activeIndex))activeIndex=indices[0];
      selector.hidden=indices.length<2;
      selector.innerHTML=indices.map(n=>`<option value="${n}">Preview card c${n}</option>`).join('');selector.value=activeIndex;
      const hidden=matches.filter(m=>m[1]===activeIndex).map(m=>m[2].split('::')[0]);
      hiddenInfo.textContent=hidden.length?`c${activeIndex}: ${hidden.length} hidden phrase${hidden.length===1?'':'s'} · ${hidden.join(' ').trim().split(/\s+/).length} word(s). Other cloze numbers remain visible.`:'Add a valid cloze marker to preview.';
      preview.innerHTML=esc(card.text).replace(/\{\{c([1-9]\d*)::([^{}]+?)\}\}/g,(_,n,body)=>{const [answer,hint]=body.split('::');return n===activeIndex?`<mark>${reveal?answer:'['+(hint||'…')+']'}</mark>`:answer;});
    }
    selector.onchange=e=>{activeIndex=e.target.value;reveal=false;div.querySelector('.reveal').textContent='Reveal answer';drawPreview();};
    div.querySelector('input').onchange = e => {card.enabled=e.target.checked;changed();$('#cloze-count').textContent=project.clozes.filter(c=>c.enabled).length;};
    div.querySelector('textarea').oninput = e => {card.text=e.target.value;changed();drawPreview();};
    const textEditor = div.querySelector('textarea');
    const clozeButton = document.createElement('button');
    clozeButton.className = 'secondary'; clozeButton.textContent = 'Cloze selection';
    clozeButton.title = 'Select a short answer, then press Ctrl/Cmd+Shift+C';
    textEditor.after(clozeButton);
    clozeButton.onmousedown = e => e.preventDefault();
    function wrapSelection() {
      let a=textEditor.selectionStart, b=textEditor.selectionEnd;
      const value=textEditor.value;
      while(a<b && /\s/.test(value[a]))a++;
      while(b>a && /\s/.test(value[b-1]))b--;
      if(a===b){status('Select the answer text in this card first.',true);return;}
      const spans=[...value.matchAll(/\{\{c([1-9]\d*)::[^{}]+?\}\}/g)];
      if(spans.some(m=>a<m.index+m[0].length && b>m.index) || /[{}]/.test(value.slice(a,b))){status('Select plain text outside existing cloze markers.',true);return;}
      const n=Math.max(0,...spans.map(m=>Number(m[1])))+1;
      if(n>99){status('This note already uses the highest supported cloze number (99).',true);return;}
      textEditor.setRangeText(`{{c${n}::${value.slice(a,b)}}}`,a,b,'select');
      card.text=textEditor.value; changed();drawPreview();textEditor.focus();
    }
    clozeButton.onclick=wrapSelection;
    textEditor.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='c'){e.preventDefault();wrapSelection();}};
    div.querySelector('.extra').oninput = e => {card.extra=e.target.value;changed();};
    div.querySelector('.remove').onclick = () => {project.clozes.splice(index,1);changed();renderClozes();};
    div.querySelector('.reveal').onclick = e => {reveal=!reveal;e.target.textContent=reveal?'Hide answer':'Reveal answer';drawPreview();};
    drawPreview(); $('#clozes').append(div);
  });
}
function renderImages() {
  $('#images').innerHTML = '';
  if (!project.images.length) $('#images').innerHTML = '<div class="empty">Upload a diagram or screenshot, or import a webpage with images.</div>';
  project.images.forEach(picture => {
    if (!views.has(picture.id)) views.set(picture.id,{preview:false,answer:false,selected:picture.regions[0]?.id});
    const view = views.get(picture.id);
    const div = document.createElement('article');div.className='image-card';
    div.innerHTML = `<div class="card-top"><label class="check"><input type="checkbox" ${picture.enabled?'checked':''}>Include image</label><span class="hint count"></span></div><div class="image-toolbar"><select aria-label="Occlusion mode"><option value="ao">Hide all · reveal one</option><option value="oa">Hide one · reveal one</option></select><button class="secondary toggle">Preview</button><button class="secondary answer" hidden>Reveal answer</button><button class="quiet next" hidden>Next mask →</button></div><div class="image-stage edit"><img draggable="false" alt="${esc(picture.caption || 'Image to occlude')}" src="/studio/api/projects/${project.id}/images/${picture.id}"></div><div class="region-editor" hidden><input aria-label="Hidden answer" placeholder="Hidden answer (shown only on the back)"><button class="danger delete">Delete mask</button></div><label>CAPTION / EXTRA CONTEXT (BACK OF CARD)</label><input class="caption" value="${esc(picture.caption)}">`;
    const stage = div.querySelector('.image-stage');
    const editor = div.querySelector('.region-editor');
    function draw(){
      stage.querySelectorAll('.mask').forEach(m=>m.remove());
      if(!picture.regions.some(r=>r.id===view.selected))view.selected=picture.regions[0]?.id;
      stage.className='image-stage '+(view.preview?'preview':'edit');
      div.querySelector('.toggle').textContent=view.preview?'Edit masks':'Preview';
      div.querySelector('.answer').hidden=!view.preview;
      div.querySelector('.next').hidden=!view.preview;
      div.querySelector('.answer').textContent=view.answer?'Hide answer':'Reveal answer';
      div.querySelector('.count').textContent=`${picture.regions.length} masks`;
      picture.regions.forEach((r,i)=>{
        const active=r.id===view.selected;
        if(view.preview && ((picture.mode==='oa' && (!active || view.answer)) || (picture.mode==='ao' && view.answer && active)))return;
        const box=document.createElement('div');box.className='mask'+(active?' selected active':'');
        Object.assign(box.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'});
        box.textContent=view.preview?'':i+1;
        box.onpointerdown=e=>{e.stopPropagation();if(view.preview||busy||e.button!==0)return;e.preventDefault();view.selected=r.id;moving={region:r,x:r.x,y:r.y,point:point(e)};stage.setPointerCapture(e.pointerId);draw();};
        stage.append(box);
      });
      const selected=picture.regions.find(r=>r.id===view.selected);
      editor.hidden=!selected || view.preview;
      editor.querySelector('input').value=selected?.label || '';
    }
    let start=null, temporary=null, moving=null;
    const point=e=>{const r=stage.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
    const bounds=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
    stage.onpointerdown=e=>{if(view.preview || busy || e.button!==0)return;e.preventDefault();start=point(e);stage.setPointerCapture(e.pointerId);temporary=document.createElement('div');temporary.className='mask temporary';stage.append(temporary);};
    stage.onpointermove=e=>{if(moving){const p=point(e),r=moving.region;r.x=Math.max(0,Math.min(1-r.width,moving.x+p.x-moving.point.x));r.y=Math.max(0,Math.min(1-r.height,moving.y+p.y-moving.point.y));draw();return;}if(!start)return;const r=bounds(start,point(e));Object.assign(temporary.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'});};
    stage.onpointerup=e=>{if(moving){if(moving.region.x!==moving.x||moving.region.y!==moving.y)changed();moving=null;draw();return;}if(!start)return;const r=bounds(start,point(e));start=null;temporary?.remove();if(r.width>.005 && r.height>.005 && picture.regions.length<60){const region={id:uuid(),...r,label:''};picture.regions.push(region);view.selected=region.id;changed();}draw();};
    stage.onpointercancel=()=>{if(moving){moving.region.x=moving.x;moving.region.y=moving.y;moving=null;draw();}start=null;temporary?.remove();};
    div.querySelector('.check input').onchange=e=>{picture.enabled=e.target.checked;changed();};
    div.querySelector('select').value=picture.mode;
    div.querySelector('select').onchange=e=>{picture.mode=e.target.value;changed();draw();};
    div.querySelector('.toggle').onclick=()=>{view.preview=!view.preview;view.answer=false;draw();};
    div.querySelector('.answer').onclick=()=>{view.answer=!view.answer;draw();};
    div.querySelector('.next').onclick=()=>{const i=picture.regions.findIndex(r=>r.id===view.selected);view.selected=picture.regions[(i+1)%picture.regions.length]?.id;view.answer=false;draw();};
    editor.querySelector('input').oninput=e=>{const r=picture.regions.find(r=>r.id===view.selected);if(r){r.label=e.target.value;changed();}};
    div.querySelector('.delete').onclick=()=>{picture.regions=picture.regions.filter(r=>r.id!==view.selected);changed();draw();};
    div.querySelector('.caption').oninput=e=>{picture.caption=e.target.value;changed();};
    const review=document.createElement('p');review.className='quality-warning';review.textContent=(picture.review_notes||[]).join(' ');review.hidden=!review.textContent;div.append(review);
    draw();$('#images').append(div);
  });
}
$('#import').onclick=()=>action(async()=>{if(dirty)await save();status('Reading the page and importing its images…');const p=await api('/projects',{url:$('#url').value.trim()});await openProject(p);status('Page imported. Review the source, then suggest cards.');});
$('#create').onclick=()=>action(async()=>{if(dirty)await save();await openProject(await api('/projects',{title:$('#new-title').value.trim()||'Untitled page',text:$('#new-text').value}));status('Workspace created. Add images or suggest cards when you’re ready.');});
$('#demo').onclick=()=>action(async()=>{if(dirty)await save();await openProject(await api('/demo',{}));status('Example loaded: three cloze cards and three image masks. You can export it immediately.');});
$('#generated-demo').onclick=()=>action(async()=>{if(dirty)await save();await openProject(await api('/demo/generated',{}));status('AI-illustrated example loaded, with three fitted occlusion masks. The illustration was generated from text; loading this sample is free.');});
$('#projects').onchange=e=>{const id=e.target.value;if(id)action(async()=>{if(dirty)await save();await openProject(await api('/projects/'+id));status('Workspace opened.');});};
$('#save').onclick=()=>action(async()=>{await save();await cost();await refreshList();status('Saved on this computer.');});
['#title','#source','#source-text','#target-cards','#generate-masks'].forEach(s=>$(s).oninput=changed);
$('#add-cloze').onclick=()=>{if(project.clozes.length>=500){status('This workspace has reached 500 notes. Remove unwanted notes or create another workspace.',true);return;}project.clozes.push({id:uuid(),text:'{{c1::Answer}} belongs in a sentence with enough context.',extra:'',evidence:'',enabled:true});changed();renderClozes();};
function generateCards(section) {return action(async()=>{
  await save();
  const usingCodex=$('#mode').value==='codex';
  if(usingCodex)startMonitor(project.id,true);
  status($('#mode').value==='codex'?'Codex is reading your material… This can take a few minutes.':'Creating suggestions…');
  try {
    const p=await api(`/projects/${project.id}/generate`,{mode:$('#mode').value,card_count:project.target_cards,...(section ? {section} : {})});
    await openProject(p);
    const flagged=p.clozes.filter(c=>!c.enabled&&c.review_notes?.length).length+p.images.filter(i=>!i.enabled&&i.review_notes?.length).length;
    status($('#mode').value==='offline'?'Offline suggestions added. This mode recognizes English definitions and existing cloze syntax; draw image masks manually.':`AI suggestions added. ${flagged?flagged+' flagged draft(s) excluded from export; review the amber notes. ':''}Check facts and mask placement before export.`);
  } finally {
    if(usingCodex){
      clearInterval(monitorTimer);monitorTimer=null;
      while(monitorPending)await new Promise(resolve=>setTimeout(resolve,25));
      await refreshMonitor(project.id);
    }
    await cost();
  }
});}
$('#generate').onclick=()=>generateCards();
$('#generate-section').onclick=()=>{if(!sourceSelection){status('Select a passage in the source text first.',true);return;}generateCards(sourceSelection);};
$('#upload').onchange=e=>{const files=[...e.target.files];action(async()=>{await save();for(const file of files){const data=new FormData();data.append('file',file);const res=await fetch(`/studio/api/projects/${project.id}/images`,{method:'POST',body:data});if(!res.ok)throw Error((await res.json()).detail);project=await res.json();}await openProject(project);status('Images added. Drag over labels to create occlusions.');});e.target.value='';};
$('#download-package').onclick=()=>action(async()=>{await save();const res=await fetch(`/studio/api/projects/${project.id}/export`,{method:'POST'});if(!res.ok)throw Error((await res.json()).detail);const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=(project.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'flashcards')+'.apkg';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status(`${res.headers.get('X-Card-Count')} cards exported. Open the .apkg file in Anki to import.`);});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
const defaultDeckKey = 'flashcard-studio.default-anki-deck';
let defaultDeck = '';
let ankiConnected = false;
$('#anki-send').textContent='Add enabled notes & sync';
try {defaultDeck = localStorage.getItem(defaultDeckKey) || '';} catch (_) {/* Storage can be disabled by the browser. */}
function showDefaultDeck() {
  $('#anki-default-info').textContent = defaultDeck ? `Default deck: ${defaultDeck}. Remembered in this browser; verify the active Anki profile before sending.` : 'No default deck set. Choose a deck and save it as your default for this browser.';
  $('#anki-clear-default').hidden = !defaultDeck;
}
showDefaultDeck();
$('#anki-default').onclick=()=>{
  const deck=$('#anki-deck').value;
  if(!deck){status('Connect to Anki and choose a deck first.',true);return;}
  try {localStorage.setItem(defaultDeckKey,deck);} catch (_) {status('Your browser could not save the default deck. Allow local storage and try again.',true);return;}
  defaultDeck=deck;showDefaultDeck();status(`Default Anki deck set to ${deck}.`);
};
$('#anki-clear-default').onclick=()=>{
  try {localStorage.removeItem(defaultDeckKey);} catch (_) {status('Your browser could not clear the default deck.',true);return;}
  defaultDeck='';showDefaultDeck();status('Default deck cleared. Your current deck selection is unchanged.');
};
$('#anki-connect').onclick=()=>action(async()=>{
  const result=await api('/anki/decks',{});
  ankiConnected=true;
  $('#anki-deck').innerHTML='<option value="">Choose an Anki deck…</option>'+result.decks.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
  if(defaultDeck && result.decks.includes(defaultDeck)) {
    $('#anki-deck').value=defaultDeck;status(`Connected to Anki. Default deck selected: ${defaultDeck}.`);
  } else if(defaultDeck) {
    status(`Connected, but default deck “${defaultDeck}” is unavailable in the open Anki profile. Choose a deck before sending.`,true);
  } else {
    $('#anki-deck').value=result.decks[0] || '';status('Connected to Anki. Choose a deck, then add your enabled notes.');
  }
});
function exportAndSync(){return action(async()=>{
  const deck=$('#anki-deck').value || (!ankiConnected ? defaultDeck : '');
  if(!deck)throw Error('Connect to Anki and choose a deck first.');
  await save();status(`Adding enabled notes to ${deck}, then requesting Anki sync…`);
  const r=await api(`/projects/${project.id}/anki`,{deck});
  let message=`${r.added} notes added; ${r.skipped} previously sent notes skipped.`;
  if(r.errors.length)message+=' '+r.errors.length+' failed: '+r.errors.join(' ');
  if(r.sync?.state==='requested')message+=' Anki sync requested. Check Anki for completion, then sync AnkiDroid.';
  else if(r.sync?.state==='failed')message+=' Sync failed or could not be confirmed; added notes remain in Anki. Check Anki’s sync/login prompts, then retry export (previously added notes will be skipped). '+r.sync.error;
  else message+=' No sync was requested.';
  status(message,r.errors.length>0 || r.sync?.state==='failed');
});}
$('#anki-send').onclick=exportAndSync;
$('#export').onclick=exportAndSync;
$('#mode').onchange=()=>cost().catch(e=>status(e.message,true));
Promise.all([refreshList(),api('/config').then(c=>{config=c;if(c.codex?.ready)$('#mode').value='codex';return cost();})]).then(async()=>{const id=new URLSearchParams(location.search).get('project');if(id&&/^[a-f0-9]{32}$/.test(id))await openProject(await api('/projects/'+id));}).catch(e=>status(e.message,true));

const lumenTopic = new URLSearchParams(location.search).get('topic');
if (new URLSearchParams(location.search).has('embedded')) document.body.classList.add('embedded');
$('#send-lumen').onclick = () => action(async () => {
  await save();
  const response = await fetch(`/api/studio/projects/${project.id}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topicId: lumenTopic || undefined }) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Could not add cards to Lumen.');
  status(`${result.added} cards added; ${result.updated} updated. Your existing review history is preserved.`);
  if (window.parent !== window) window.parent.postMessage({ type: 'lumen:studio-imported', topicId: result.topicId }, location.origin);
});
