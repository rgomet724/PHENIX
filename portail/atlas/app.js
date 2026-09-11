const state = { user:null, canManage:false, canOperate:true, missions:[], crews:[], natures:[], streets:[], nextMissionId:null, serverTime:Date.now(), banResults:[] };
let banTimer=null;
let banRequestSeq=0;
const $ = id => document.getElementById(id);

async function api(url,opt={}){
  const headers=new Headers(opt.headers||{});
  if(opt.body!==undefined && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const r=await fetch(url,{...opt,headers,credentials:'same-origin',cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(r.status===401){setTimeout(()=>{location.href='/portail/';},250);throw new Error(j.message||'Connexion ARGOS requise.');}
  if(!r.ok)throw new Error(j.message||j.error||('Erreur '+r.status));
  return j;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtTime(v){if(!v)return '—';return new Date(v).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}
function elapsed(from){if(!from)return 'Non démarrée';const ms=Math.max(0,Date.now()-new Date(from).getTime());const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);return h?`${h} h ${String(m).padStart(2,'0')} min`:`${m} min ${String(s).padStart(2,'0')} s`;}
function fullAddress(m){return [m.number,m.street,m.complement].filter(Boolean).join(' ');}
function statusLabel(s){return ({WAITING:'EN ATTENTE',ASSIGNED:'AFFECTÉE',DEPARTED:'PARTIE',ONSCENE:'SUR PLACE'})[s]||s;}
function priorityLabel(p){return p==='URGENT'?'PRIORITAIRE':'NORMALE';}
function crewById(id){return state.crews.find(c=>String(c.id)===String(id));}

function openModal(id){$(id).classList.remove('hidden');document.body.style.overflow='hidden';}
function closeModal(id){$(id).classList.add('hidden');if(document.querySelectorAll('.modal:not(.hidden)').length===0)document.body.style.overflow='';}

document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)closeModal(b.dataset.close);if(e.target.classList.contains('modal'))closeModal(e.target.id);});

function populateSelects(){
  const crewOptions=state.crews.map(c=>`<option value="${esc(c.id)}">${esc(c.callsign)} — ${esc(c.status)}</option>`).join('');
  $('missionCrew').innerHTML='<option value="">À affecter plus tard</option>'+crewOptions;
  $('assignCrew').innerHTML=crewOptions||'<option value="">Aucune patrouille active</option>';
  $('nextCrew').innerHTML='<option value="">Choisir une patrouille</option>'+crewOptions;
}

async function loadBanStreets(){
  const select=$('missionStreet');
  const status=$('banStatus');
  if(!select)return;
  select.disabled=true;
  select.innerHTML='<option value="">Chargement des voies de Chalon-sur-Saône…</option>';
  if(status){status.textContent='Connexion à la Base Adresse Nationale…';status.classList.remove('ok','error');}
  try{
    // t=Date.now() empêche tout cache navigateur : chaque ouverture déclenche bien un appel au serveur,
    // lequel vérifie à son tour la version disponible dans la BAN officielle.
    const d=await api('/portail/atlas/api/streets?t='+Date.now());
    const streets=Array.isArray(d.streets)?d.streets:[];
    state.banStreets=streets;
    select.replaceChildren();
    const first=document.createElement('option');first.value='';first.textContent='Choisir une voie';select.appendChild(first);
    streets.forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;select.appendChild(o);});
    select.disabled=false;
    if(status){
      status.textContent=`${streets.length} voie${streets.length>1?'s':''} chargée${streets.length>1?'s':''} depuis la Base Adresse Nationale${d.stale?' (dernière liste disponible)':''}.`;
      status.classList.add(d.stale?'error':'ok');
    }
  }catch(e){
    state.banStreets=[];
    select.replaceChildren();
    const o=document.createElement('option');o.value='';o.textContent='Liste des voies indisponible';select.appendChild(o);select.disabled=true;
    if(status){status.textContent='Impossible de charger les voies depuis la Base Adresse Nationale.';status.classList.add('error');}
  }
}

function renderNext(){
  const box=$('nextMissionBox');
  const m=state.missions.find(x=>x.id===state.nextMissionId);
  if(!m){box.innerHTML='<div class="empty-next">Aucune mission à venir</div>';return;}
  box.innerHTML=`<div class="next-summary"><div><h2>${esc(m.natureLabel)}</h2><p>${esc(fullAddress(m))}</p></div><span class="next-priority ${m.priority==='URGENT'?'urgent':'normal'}">${priorityLabel(m.priority)}</span></div>`;
}

function missionCard(m){
  const t=$('missionTemplate').content.cloneNode(true);
  const card=t.querySelector('.mission-card');
  card.classList.add(m.priority==='URGENT'?'urgent':'normal');
  t.querySelector('.priority-label').textContent=priorityLabel(m.priority);
  t.querySelector('.nature').textContent=(m.natureCode?m.natureCode+' — ':'')+m.natureLabel;
  t.querySelector('.status-badge').textContent=statusLabel(m.status);
  t.querySelector('.address').textContent=fullAddress(m);
  const notes=t.querySelector('.notes');notes.textContent=m.notes||'';notes.classList.toggle('hidden',!m.notes);
  t.querySelector('.created').textContent=fmtTime(m.createdAt);
  const liveCrew=crewById(m.crewId);
  t.querySelector('.crew').textContent=m.crewCallsign||'Non affectée';
  if(m.crewId&&!liveCrew)t.querySelector('.crew').textContent+=(m.crewCallsign?' · ':'')+'absente de PHENIX';
  t.querySelector('.elapsed').textContent=elapsed(m.departedAt);
  const actions=t.querySelector('.mission-actions');

  if(state.canOperate){
    if(!m.crewId){
      actions.append(button('Affecter une patrouille','secondary',()=>openAssign(m.id)));
    }else if(m.status==='ASSIGNED'){
      actions.append(button('PARTIE','departed',()=>setStatus(m.id,'DEPARTED')));
    }else if(m.status==='DEPARTED'){
      actions.append(button('SUR PLACE','onscene',()=>setStatus(m.id,'ONSCENE')));
      actions.append(button('TERMINÉ','done',()=>setStatus(m.id,'DONE')));
    }else if(m.status==='ONSCENE'){
      actions.append(button('TERMINÉ','done',()=>setStatus(m.id,'DONE')));
    }
    if(state.canManage)actions.append(button('Supprimer','danger',()=>deleteMission(m.id)));
  }else{
    const ro=document.createElement('span');ro.className='muted';ro.textContent='Lecture seule';actions.append(ro);
  }
  return t;
}
function button(label,kind,fn){const b=document.createElement('button');b.type='button';b.className='btn '+kind;b.textContent=label;b.addEventListener('click',fn);return b;}

function renderMissions(){
  const waiting=state.missions.filter(m=>['WAITING','ASSIGNED'].includes(m.status));
  const active=state.missions.filter(m=>['DEPARTED','ONSCENE'].includes(m.status));
  $('waitingCount').textContent=waiting.length;$('activeCount').textContent=active.length;
  const w=$('waitingList'),a=$('activeList');w.replaceChildren();a.replaceChildren();
  if(!waiting.length)w.innerHTML='<div class="empty-list">Aucune mission à venir</div>';else waiting.forEach(m=>w.appendChild(missionCard(m)));
  if(!active.length)a.innerHTML='<div class="empty-list">Aucune intervention en cours</div>';else active.forEach(m=>a.appendChild(missionCard(m)));
}

function renderAll(){
  $('currentUser').textContent=state.user?`${state.user.name} · ${state.user.role}`:'—';
  $('manageBtn').classList.toggle('hidden',!state.canManage);
  $('newMissionBtn').classList.toggle('hidden',!state.canOperate);
  $('takeNextBtn').classList.toggle('hidden',!state.canOperate);
  $('nextCrew').disabled=!state.canOperate;
  populateSelects();renderNext();renderMissions();
}

async function refresh(silent=false){
  try{
    const d=await api('/portail/atlas/api/state');Object.assign(state,d);$('syncState').textContent='PHENIX connecté';$('syncState').style.background='rgba(255,255,255,.13)';renderAll();
  }catch(e){$('syncState').textContent='Connexion perdue';$('syncState').style.background='rgba(217,35,46,.35)';if(!silent)alert(e.message);}
}

$('newMissionBtn').addEventListener('click',()=>{if(!state.canOperate)return;$('missionForm').reset();$('missionError').textContent='';populateSelects();openModal('missionModal');loadBanStreets();setTimeout(()=>$('missionNumber')?.focus(),60);});
$('missionForm').addEventListener('submit',async e=>{
  e.preventDefault();$('missionError').textContent='';const submit=$('missionSubmit');submit.disabled=true;
  try{
    const natureLabel=String($('missionNature').value||'').trim();
    await api('/portail/atlas/api/missions',{method:'POST',body:JSON.stringify({natureCode:'',natureLabel,priority:$('missionPriority').value,crewId:$('missionCrew').value,number:$('missionNumber').value,street:$('missionStreet').value,complement:$('missionComplement').value,notes:$('missionNotes').value})});
    closeModal('missionModal');await refresh(true);
  }catch(err){$('missionError').textContent=err.message;}finally{submit.disabled=false;}
});

function openAssign(id){if(!state.canOperate)return;$('assignMissionId').value=id;$('assignError').textContent='';populateSelects();openModal('assignModal');}
$('assignSubmit').addEventListener('click',async()=>{const id=$('assignMissionId').value,crewId=$('assignCrew').value;$('assignError').textContent='';try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}/assign`,{method:'POST',body:JSON.stringify({crewId})});closeModal('assignModal');await refresh(true);}catch(e){$('assignError').textContent=e.message;}});

async function setStatus(id,status){if(!state.canOperate){alert('Compte Consultation : accès en lecture seule.');return;}try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status})});await refresh(true);}catch(e){alert(e.message);}}
async function deleteMission(id){if(!confirm('Supprimer cette intervention ?'))return;try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}`,{method:'DELETE'});await refresh(true);}catch(e){alert(e.message);}}

$('takeNextBtn').addEventListener('click',async()=>{if(!state.canOperate)return;const crewId=$('nextCrew').value;if(!crewId){alert('Choisissez une patrouille.');return;}try{const d=await api('/portail/atlas/api/next',{method:'POST',body:JSON.stringify({crewId})});if(!d.mission)alert('Aucune mission à venir.');await refresh(true);}catch(e){alert(e.message);}});

function editRow(value,type){const row=document.createElement('div');row.className='edit-row';const input=document.createElement('input');input.value=value;input.dataset.type=type;const del=document.createElement('button');del.type='button';del.textContent='×';del.addEventListener('click',()=>row.remove());row.append(input,del);return row;}
function renderManage(){
  const n=$('natureRows');n.replaceChildren();state.natures.forEach(x=>n.appendChild(editRow(x.label,'nature')));
}
$('manageBtn').addEventListener('click',()=>{renderManage();$('manageError').textContent='';openModal('manageModal');});
$('addNatureBtn').addEventListener('click',()=>{$('natureRows').appendChild(editRow('','nature'));$('natureRows').lastElementChild.querySelector('input').focus();});
$('saveCatalogBtn').addEventListener('click',async()=>{$('manageError').textContent='';try{const labels=[...$('natureRows').querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean);await api('/portail/atlas/api/catalog/natures',{method:'POST',body:JSON.stringify({labels})});closeModal('manageModal');await refresh(true);}catch(e){$('manageError').textContent=e.message;}});

setInterval(()=>{document.querySelectorAll('.mission-card').forEach(()=>{});renderMissions();renderNext();},1000);
setInterval(()=>refresh(true),2000);
refresh();
