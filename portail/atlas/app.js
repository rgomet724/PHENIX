const state = { user:null, canManage:false, missions:[], crews:[], natures:[], streets:[], nextMissionId:null, serverTime:Date.now(), banResults:[], appearance:null, notifications:{events:{}} };
let banTimer=null;
let banRequestSeq=0;
let atlasSoundEnabled=localStorage.getItem('atlasSoundEnabled')!=='false';
let atlasDesktopEnabled=localStorage.getItem('atlasDesktopNotifications')!=='false';
let atlasAudioContext=null;
let atlasAudioBuffer=null;
let atlasAudioBufferVersion='';
let atlasAudioLoading=null;
let atlasRefreshPending=null;
let atlasSeenMissions=null;
let atlasNotificationUserId='';
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

function atlasNotificationRule(){
  return state.notifications?.events?.['atlas-new-intervention']||{soundEnabled:true,desktopEnabled:true,soundUrl:'/portail/administration/api/public/notification-sounds/atlas-new-intervention',updatedAt:''};
}
function getAtlasAudioContext(){
  if(!atlasAudioContext){const AC=window.AudioContext||window.webkitAudioContext;if(AC)atlasAudioContext=new AC()}
  return atlasAudioContext;
}
async function unlockAtlasAudio(){
  const context=getAtlasAudioContext();
  if(!context)return false;
  try{if(context.state==='suspended')await context.resume();return context.state==='running'}catch{return false}
}
async function loadAtlasAudio(){
  const rule=atlasNotificationRule(),version=String(rule.updatedAt||'default'),context=getAtlasAudioContext();
  if(!context)return false;
  if(atlasAudioBuffer&&atlasAudioBufferVersion===version)return true;
  if(atlasAudioLoading){await atlasAudioLoading;if(atlasAudioBufferVersion===version&&atlasAudioBuffer)return true;}
  const task=(async()=>{
    try{
      const response=await fetch(`${rule.soundUrl}?v=${encodeURIComponent(version)}`,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('Son indisponible');
      atlasAudioBuffer=await context.decodeAudioData(await response.arrayBuffer());atlasAudioBufferVersion=version;
      return true;
    }catch{atlasAudioBuffer=null;return false;}
  })();
  atlasAudioLoading=task;
  try{return await task}finally{if(atlasAudioLoading===task)atlasAudioLoading=null;}
}
async function playAtlasSound(){
  if(!atlasSoundEnabled||atlasNotificationRule().soundEnabled===false)return false;
  if(!await unlockAtlasAudio()||!await loadAtlasAudio())return false;
  try{
    const source=atlasAudioContext.createBufferSource();source.buffer=atlasAudioBuffer;source.connect(atlasAudioContext.destination);source.start(0);return true;
  }catch{return false;}
}
async function showAtlasDesktopNotification(title,body,tag){
  if(!atlasDesktopEnabled||atlasNotificationRule().desktopEnabled===false||!('Notification' in window)||Notification.permission!=='granted')return false;
  const options={body:String(body||'').slice(0,500),tag,icon:'/portail/atlas/logo-atlas.png',silent:true};
  try{
    const registration='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration():null;
    if(registration?.active&&typeof registration.showNotification==='function')await registration.showNotification(title,options);
    else{const notification=new Notification(title,options);notification.onclick=()=>{window.focus();notification.close()};}
    return true;
  }catch{return false;}
}
async function announceAtlasMission(mission){
  await Promise.allSettled([
    playAtlasSound(),
    showAtlasDesktopNotification('ATLAS — Nouvelle intervention',[priorityLabel(mission.priority),mission.natureLabel,fullAddress(mission)].filter(Boolean).join(' · '),`atlas-mission-${mission.id}`)
  ]);
}
function updateAtlasNotificationControls(){
  $('atlasSoundEnabled').checked=atlasSoundEnabled;$('atlasDesktopEnabled').checked=atlasDesktopEnabled;
  const permission='Notification' in window?Notification.permission:'unavailable';
  $('atlasNotificationPermission').textContent=permission==='granted'?'Notifications de bureau autorisées sur ce poste.':permission==='denied'?'Notifications bloquées : autorisez-les dans les paramètres du navigateur.':permission==='unavailable'?'Ce navigateur ne propose pas les notifications de bureau.':'Cliquez sur « Autoriser sur ce poste » puis acceptez la demande du navigateur.';
  $('atlasAuthorizeNotifications').disabled=permission==='unavailable';
  $('atlasNotificationsBtn').textContent=atlasDesktopEnabled&&permission==='granted'?'🔔 Notifications activées':'🔔 Notifications';
}
async function authorizeAtlasNotifications(){
  const audioPermission=unlockAtlasAudio();
  let permission='unavailable';
  if('Notification' in window)permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  const unlocked=await audioPermission;
  if(permission==='granted'){atlasDesktopEnabled=true;localStorage.setItem('atlasDesktopNotifications','true');}
  updateAtlasNotificationControls();
  $('atlasNotificationFeedback').textContent=permission==='granted'?'Autorisation enregistrée sur ce poste.':permission==='denied'?'Autorisez les notifications dans les paramètres du navigateur.':unlocked?'Audio autorisé. Les notifications de bureau ne sont pas disponibles.':'L’audio ou les notifications ne sont pas autorisés.';
}

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
  applyAppearance();
  $('currentUser').textContent=state.user?`${state.user.name} · ${state.user.role}`:'—';
  $('manageBtn').classList.toggle('hidden',!state.canManage);
  populateSelects();renderNext();renderMissions();
  updateAtlasNotificationControls();
}

function applyAppearance(){
  const a=state.appearance;if(!a)return;
  document.documentElement.style.setProperty('--blue',a.primaryColor||'#0018a8');
  document.documentElement.style.setProperty('--blue2',a.accentColor||'#0758b6');
  document.documentElement.style.setProperty('--bg',a.backgroundColor||'#edf3f8');
  const title=document.querySelector('.brand strong'),subtitle=document.querySelector('.brand span'),logo=document.querySelector('.brand-logo');
  if(title)title.textContent=a.title||'ATLAS';
  if(subtitle)subtitle.textContent=a.subtitle||'Gestion de l’attente des interventions';
  if(logo&&a.logoData)logo.src=a.logoData;
  if(a.faviconData){let icon=document.querySelector('link[rel="icon"]');if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon)}icon.href=a.faviconData;}
  if(a.backgroundData){document.body.style.backgroundImage=`linear-gradient(rgba(237,243,248,.88),rgba(237,243,248,.94)),url(${JSON.stringify(a.backgroundData)})`;document.body.style.backgroundSize='cover';document.body.style.backgroundAttachment='fixed';}
  else document.body.style.backgroundImage='';
}

async function refresh(silent=false){
  if(atlasRefreshPending)return atlasRefreshPending;
  const task=(async()=>{
    try{
      const d=await api('/portail/atlas/api/state');
      const userId=String(d.user?.id||d.user?.login||'');
      if(atlasNotificationUserId!==userId){atlasSeenMissions=null;atlasNotificationUserId=userId;}
      const current=Array.isArray(d.missions)?d.missions:[];
      const arrived=atlasSeenMissions===null?[]:current.filter(mission=>!atlasSeenMissions.has(String(mission.id)));
      atlasSeenMissions=new Set(current.map(mission=>String(mission.id)));
      Object.assign(state,d);$('syncState').textContent='PHENIX connecté';$('syncState').style.background='rgba(255,255,255,.13)';renderAll();
      if(atlasSoundEnabled&&atlasNotificationRule().soundEnabled!==false)loadAtlasAudio().catch(()=>{});
      await Promise.allSettled(arrived.map(announceAtlasMission));
    }catch(e){$('syncState').textContent='Connexion perdue';$('syncState').style.background='rgba(217,35,46,.35)';if(!silent)alert(e.message);}
  })();
  atlasRefreshPending=task;
  try{return await task}finally{if(atlasRefreshPending===task)atlasRefreshPending=null;}
}

$('atlasNotificationsBtn').addEventListener('click',()=>{updateAtlasNotificationControls();$('atlasNotificationFeedback').textContent='';openModal('notificationsModal');});
$('atlasSoundEnabled').addEventListener('change',async event=>{atlasSoundEnabled=event.target.checked;localStorage.setItem('atlasSoundEnabled',String(atlasSoundEnabled));if(atlasSoundEnabled)await unlockAtlasAudio();});
$('atlasDesktopEnabled').addEventListener('change',async event=>{atlasDesktopEnabled=event.target.checked;localStorage.setItem('atlasDesktopNotifications',String(atlasDesktopEnabled));if(atlasDesktopEnabled)await authorizeAtlasNotifications();updateAtlasNotificationControls();});
$('atlasAuthorizeNotifications').addEventListener('click',authorizeAtlasNotifications);
$('atlasTestNotifications').addEventListener('click',async()=>{
  await unlockAtlasAudio();
  const [sound,desktop]=await Promise.all([playAtlasSound(),showAtlasDesktopNotification('ATLAS — Test de notification','Les nouvelles interventions apparaîtront sur ce poste.','atlas-notification-test')]);
  $('atlasNotificationFeedback').textContent=sound||desktop?'Test envoyé selon les réglages activés.':'Aucune alerte active ou autorisée. Vérifiez les options du poste et de l’administration ARGOS.';
});
function installAtlasAudioUnlock(){
  const handler=async()=>{if(!atlasSoundEnabled)return;if(await unlockAtlasAudio()){document.removeEventListener('pointerdown',handler,true);document.removeEventListener('keydown',handler,true);loadAtlasAudio().catch(()=>{});}};
  document.addEventListener('pointerdown',handler,true);document.addEventListener('keydown',handler,true);
}
installAtlasAudioUnlock();

$('newMissionBtn').addEventListener('click',()=>{$('missionForm').reset();$('missionError').textContent='';populateSelects();openModal('missionModal');loadBanStreets();setTimeout(()=>$('missionNumber')?.focus(),60);});
$('missionForm').addEventListener('submit',async e=>{
  e.preventDefault();$('missionError').textContent='';const submit=$('missionSubmit');submit.disabled=true;
  try{
    const natureLabel=String($('missionNature').value||'').trim();
    await api('/portail/atlas/api/missions',{method:'POST',body:JSON.stringify({natureCode:'',natureLabel,priority:$('missionPriority').value,crewId:$('missionCrew').value,number:$('missionNumber').value,street:$('missionStreet').value,complement:$('missionComplement').value,notes:$('missionNotes').value})});
    closeModal('missionModal');await refresh(true);
  }catch(err){$('missionError').textContent=err.message;}finally{submit.disabled=false;}
});

function openAssign(id){$('assignMissionId').value=id;$('assignError').textContent='';populateSelects();openModal('assignModal');}
$('assignSubmit').addEventListener('click',async()=>{const id=$('assignMissionId').value,crewId=$('assignCrew').value;$('assignError').textContent='';try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}/assign`,{method:'POST',body:JSON.stringify({crewId})});closeModal('assignModal');await refresh(true);}catch(e){$('assignError').textContent=e.message;}});

async function setStatus(id,status){try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status})});await refresh(true);}catch(e){alert(e.message);}}
async function deleteMission(id){if(!confirm('Supprimer cette intervention ?'))return;try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}`,{method:'DELETE'});await refresh(true);}catch(e){alert(e.message);}}

$('takeNextBtn').addEventListener('click',async()=>{const crewId=$('nextCrew').value;if(!crewId){alert('Choisissez une patrouille.');return;}try{const d=await api('/portail/atlas/api/next',{method:'POST',body:JSON.stringify({crewId})});if(!d.mission)alert('Aucune mission à venir.');await refresh(true);}catch(e){alert(e.message);}});

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
