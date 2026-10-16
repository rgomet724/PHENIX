const state = { user:null, canManage:false, canOperate:false, missions:[], crews:[], natures:[], streets:[], banStreets:[], nextMissionId:null, serverTime:Date.now(), banResults:[], appearance:null, notifications:{events:{}} };
let streetSuggestionIndex=-1;
let banStreetLoading=false;
let banRequestSeq=0;
const assignmentChoices=new Map();
const assignmentPending=new Set();
let takeNextPending=false;
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
function statusLabel(s){return ({WAITING:'EN ATTENTE',ASSIGNED:'EN COURS',DEPARTED:'EN COURS',IN_PROGRESS:'EN COURS',ONSCENE:'SUR PLACE'})[s]||s;}
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
  $('atlasNotificationsBtn').textContent=atlasDesktopEnabled&&permission==='granted'?'Notifications activées':'Notifications';
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
  fillCrewSelect($('missionCrew'),'À affecter plus tard');
  fillCrewSelect($('nextCrew'),'Choisir une patrouille');
  updateAssignmentFields();
}

function crewAssignable(crew){
  if(typeof crew.assignable==='boolean')return crew.assignable;
  return String(crew.status).toUpperCase()==='DISPO'&&!state.missions.some(m=>String(m.crewId)===String(crew.id)&&['ASSIGNED','DEPARTED','IN_PROGRESS','ONSCENE'].includes(m.status));
}
function fillCrewSelect(select,placeholder){
  const selected=select.value;
  const options=`<option value="">${esc(placeholder)}</option>`+state.crews.map(crew=>`<option value="${esc(crew.id)}" ${crewAssignable(crew)?'':'disabled'}>${esc(crew.callsign)} — ${crewAssignable(crew)?'DISPONIBLE':'INDISPONIBLE'}</option>`).join('');
  if(select.dataset.crewOptions===options)return;
  select.dataset.crewOptions=options;select.innerHTML=options;
  if([...select.options].some(option=>option.value===selected))select.value=selected;
}
function preferredAssignmentMode(){return localStorage.getItem('atlasAssignmentMode')==='auto'?'auto':'manual';}
function selectedAssignmentMode(name){return document.querySelector(`input[name="${name}"]:checked`)?.value||'manual';}
function setAssignmentMode(name,mode){document.querySelectorAll(`input[name="${name}"]`).forEach(input=>{input.checked=input.value===mode;});}
function updateAssignmentFields(){
  const nextAuto=selectedAssignmentMode('nextAssignmentMode')==='auto';
  const missionAuto=selectedAssignmentMode('missionAssignmentMode')==='auto';
  $('nextCrewField').classList.toggle('hidden',nextAuto);
  $('missionCrewField').classList.toggle('hidden',missionAuto);
  $('nextAssignmentHelp').textContent=nextAuto?'ATLAS choisit une patrouille disponible au clic sur Affecter.':'Choisissez la patrouille pour l’intervention prioritaire.';
  $('missionSubmit').textContent=missionAuto||$('missionCrew').value?'Créer et affecter':'Enregistrer en attente';
  const available=state.crews.filter(crewAssignable);
  if(!available.length)$('nextAssignmentHelp').textContent='Aucune patrouille disponible. L’intervention reste en attente.';
  const selected=state.crews.find(crew=>crew.id===$('nextCrew').value);
  $('takeNextBtn').disabled=takeNextPending||!state.canOperate||!state.nextMissionId||(nextAuto?!available.length:!selected||!crewAssignable(selected));
}

function normalizeStreet(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[’']/g,' ').replace(/[-\s]+/g,' ').trim();}
function streetMatches(query){
  const normalized=normalizeStreet(query);
  if(!normalized)return [];
  return state.banStreets.filter(street=>normalizeStreet(street).includes(normalized)).sort((a,b)=>{
    const rank=value=>normalizeStreet(value)===normalized?0:normalizeStreet(value).startsWith(normalized)?1:2;
    return rank(a)-rank(b)||a.localeCompare(b,'fr',{sensitivity:'base',numeric:true});
  }).slice(0,18);
}
function closeStreetSuggestions(){
  $('missionStreetSuggestions').classList.add('hidden');$('missionStreet').setAttribute('aria-expanded','false');
  $('missionStreet').removeAttribute('aria-activedescendant');streetSuggestionIndex=-1;
}
function chooseStreet(street){$('missionStreet').value=street;$('missionStreet').setCustomValidity('');closeStreetSuggestions();$('missionStreet').focus();}
function highlightStreetSuggestion(index){
  const options=[...$('missionStreetSuggestions').children];
  if(!options.length)return;
  streetSuggestionIndex=(index+options.length)%options.length;
  options.forEach((option,i)=>{option.classList.toggle('active',i===streetSuggestionIndex);option.setAttribute('aria-selected',String(i===streetSuggestionIndex));});
  $('missionStreet').setAttribute('aria-activedescendant',options[streetSuggestionIndex].id);
  options[streetSuggestionIndex].scrollIntoView({block:'nearest'});
}
function renderStreetSuggestions(){
  const box=$('missionStreetSuggestions');box.replaceChildren();streetSuggestionIndex=-1;
  const matches=streetMatches($('missionStreet').value);
  if(!matches.length){closeStreetSuggestions();return;}
  matches.forEach((street,index)=>{
    const option=document.createElement('button');option.type='button';option.className='street-suggestion';option.id=`atlas-street-${index}`;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.textContent=street;
    option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>chooseStreet(street));box.appendChild(option);
  });
  box.classList.remove('hidden');$('missionStreet').setAttribute('aria-expanded','true');
}
function streetSubmissionValue(){
  const value=$('missionStreet').value.trim();
  if(!value)throw new Error('Indiquez la voie de l’intervention.');
  if(banStreetLoading&&!state.banStreets.length)throw new Error('La liste des voies est en cours de chargement. Réessayez dans un instant.');
  const exact=state.banStreets.find(street=>normalizeStreet(street)===normalizeStreet(value));
  if(state.banStreets.length&&!exact)throw new Error('Choisissez une voie parmi les résultats de la recherche.');
  return exact||value;
}
async function loadBanStreets(){
  const input=$('missionStreet'),status=$('banStatus'),request=++banRequestSeq;
  banStreetLoading=true;input.setAttribute('aria-busy','true');
  status.textContent=state.banStreets.length?'Recherche disponible · actualisation des voies…':'Chargement des voies · vous pouvez déjà saisir le nom…';status.classList.remove('ok','error');
  try{
    const d=await api('/portail/atlas/api/streets?t='+Date.now());
    if(request!==banRequestSeq)return;
    state.banStreets=[...new Set((d.streets||[]).map(street=>String(street).trim()).filter(Boolean))];
    status.textContent=`${state.banStreets.length} voies · tapez quelques lettres puis choisissez la voie${d.stale?' · dernière liste disponible':''}.`;status.classList.add(d.stale?'error':'ok');
    if(document.activeElement===input)renderStreetSuggestions();
  }catch(e){
    if(request!==banRequestSeq)return;
    status.textContent=state.banStreets.length?'Actualisation indisponible : recherche dans la dernière liste chargée.':'Liste des voies indisponible : saisissez et vérifiez le nom complet de la voie.';status.classList.add('error');
  }finally{if(request===banRequestSeq){banStreetLoading=false;input.removeAttribute('aria-busy');}}
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
  card.dataset.missionId=m.id;
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
  t.querySelector('.elapsed').textContent=elapsed(m.startedAt||m.departedAt);
  const actions=t.querySelector('.mission-actions');

  if(!m.crewId&&state.canOperate){
    actions.append(missionAssignmentForm(m));
  }else if(['IN_PROGRESS','ASSIGNED','DEPARTED'].includes(m.status)&&state.canOperate){
    actions.append(button('SUR PLACE','onscene',()=>setStatus(m.id,'ONSCENE')));
    actions.append(button('TERMINÉ','done',()=>setStatus(m.id,'DONE')));
  }else if(m.status==='ONSCENE'&&state.canOperate){
    actions.append(button('TERMINÉ','done',()=>setStatus(m.id,'DONE')));
  }
  if(state.canManage)actions.append(button('Supprimer','danger',()=>deleteMission(m.id)));
  return t;
}
function button(label,kind,fn){const b=document.createElement('button');b.type='button';b.className='btn '+kind;b.textContent=label;b.addEventListener('click',fn);return b;}

function missionAssignmentForm(mission){
  const choice=assignmentChoices.get(mission.id)||{assignmentMode:preferredAssignmentMode(),crewId:''};
  assignmentChoices.set(mission.id,choice);
  const form=document.createElement('form');form.className='mission-assignment';
  form.innerHTML=`<fieldset class="assignment-mode"><legend>Affectation de la patrouille</legend><label><input type="radio" name="assignment-${esc(mission.id)}" value="auto" ${choice.assignmentMode==='auto'?'checked':''}> Automatique</label><label><input type="radio" name="assignment-${esc(mission.id)}" value="manual" ${choice.assignmentMode==='manual'?'checked':''}> Manuelle</label></fieldset><label class="crew-choice">Patrouille disponible<select aria-label="Patrouille pour cette intervention"></select></label><small class="assignment-explanation"></small><button class="btn primary" type="submit">Affecter</button><p class="error" role="alert"></p>`;
  const select=form.querySelector('select'),submit=form.querySelector('button[type="submit"]'),error=form.querySelector('.error');
  fillCrewSelect(select,'Choisir une patrouille');select.value=choice.crewId;
  const update=()=>{
    const auto=choice.assignmentMode==='auto';
    form.querySelector('.crew-choice').classList.toggle('hidden',auto);
    form.querySelector('.assignment-explanation').textContent=auto?'Une patrouille disponible sera choisie au clic sur Affecter.':'L’affectation démarre immédiatement l’intervention.';
    const selected=state.crews.find(crew=>crew.id===choice.crewId);
    if(!state.crews.some(crewAssignable))form.querySelector('.assignment-explanation').textContent='Aucune patrouille disponible. L’intervention reste en attente.';
    submit.disabled=assignmentPending.has(mission.id)||(auto?!state.crews.some(crewAssignable):!selected||!crewAssignable(selected));
  };
  form.querySelectorAll('input[type="radio"]').forEach(input=>input.addEventListener('change',()=>{choice.assignmentMode=input.value;localStorage.setItem('atlasAssignmentMode',input.value);error.textContent='';update();}));
  select.addEventListener('change',()=>{choice.crewId=select.value;error.textContent='';update();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(assignmentPending.has(mission.id))return;
    assignmentPending.add(mission.id);error.textContent='';submit.disabled=true;submit.textContent='Affectation…';
    try{
      await api(`/portail/atlas/api/missions/${encodeURIComponent(mission.id)}/assign`,{method:'POST',body:JSON.stringify({assignmentMode:choice.assignmentMode,crewId:choice.assignmentMode==='manual'?choice.crewId:''})});
      assignmentChoices.delete(mission.id);await refreshAfterMutation();
    }catch(e){error.textContent=e.message;}
    finally{assignmentPending.delete(mission.id);submit.textContent='Affecter';update();}
  });
  update();return form;
}

function renderMissions(){
  const waiting=state.missions.filter(m=>m.status==='WAITING');
  const active=state.missions.filter(m=>['IN_PROGRESS','ASSIGNED','DEPARTED','ONSCENE'].includes(m.status));
  $('waitingCount').textContent=waiting.length;$('activeCount').textContent=active.length;
  for(const [id,missions,empty] of [['waitingList',waiting,'Aucune mission à venir'],['activeList',active,'Aucune intervention en cours']]){
    const list=$(id),key=JSON.stringify([missions,state.crews,state.canOperate,state.canManage]);
    if(list.dataset.renderKey===key)continue;
    list.dataset.renderKey=key;list.replaceChildren();
    if(!missions.length)list.innerHTML=`<div class="empty-list">${empty}</div>`;
    else missions.forEach(mission=>list.appendChild(missionCard(mission)));
  }
  for(const id of assignmentChoices.keys())if(!waiting.some(m=>m.id===id))assignmentChoices.delete(id);
}

function renderAll(){
  applyAppearance();
  $('currentUser').textContent=state.user?`${state.user.name} · ${state.user.role}`:'—';
  $('manageBtn').classList.toggle('hidden',!state.canManage);
  $('newMissionBtn').classList.toggle('hidden',!state.canOperate);
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

async function refreshAfterMutation(){
  // Attendre une éventuelle lecture antérieure au clic, puis recharger l’état enregistré.
  if(atlasRefreshPending)await refresh(true);
  return refresh(true);
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

$('newMissionBtn').addEventListener('click',()=>{$('missionForm').reset();$('missionError').textContent='';closeStreetSuggestions();setAssignmentMode('missionAssignmentMode',preferredAssignmentMode());populateSelects();$('missionCrew').value='';updateAssignmentFields();openModal('missionModal');loadBanStreets();setTimeout(()=>$('missionNature')?.focus(),60);});
$('missionForm').addEventListener('submit',async e=>{
  e.preventDefault();$('missionError').textContent='';const submit=$('missionSubmit');submit.disabled=true;
  try{
    const natureLabel=String($('missionNature').value||'').trim();
    const assignmentMode=selectedAssignmentMode('missionAssignmentMode');
    const street=streetSubmissionValue();
    await api('/portail/atlas/api/missions',{method:'POST',body:JSON.stringify({natureCode:'',natureLabel,priority:$('missionPriority').value,assignmentMode,crewId:assignmentMode==='manual'?$('missionCrew').value:'',number:$('missionNumber').value,street,complement:$('missionComplement').value,notes:$('missionNotes').value})});
    closeModal('missionModal');await refreshAfterMutation();
  }catch(err){$('missionError').textContent=err.message;}finally{submit.disabled=false;}
});

async function setStatus(id,status){try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status})});await refreshAfterMutation();}catch(e){alert(e.message);}}
async function deleteMission(id){if(!confirm('Supprimer cette intervention ?'))return;try{await api(`/portail/atlas/api/missions/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshAfterMutation();}catch(e){alert(e.message);}}

$('takeNextBtn').addEventListener('click',async()=>{
  if(takeNextPending)return;
  takeNextPending=true;$('nextError').textContent='';updateAssignmentFields();
  const assignmentMode=selectedAssignmentMode('nextAssignmentMode');
  try{const d=await api('/portail/atlas/api/next',{method:'POST',body:JSON.stringify({assignmentMode,crewId:assignmentMode==='manual'?$('nextCrew').value:''})});if(!d.mission)$('nextError').textContent='Aucune intervention en attente.';await refreshAfterMutation();}
  catch(e){$('nextError').textContent=e.message;}finally{takeNextPending=false;updateAssignmentFields();}
});
document.querySelectorAll('input[name="nextAssignmentMode"], input[name="missionAssignmentMode"]').forEach(input=>input.addEventListener('change',()=>{localStorage.setItem('atlasAssignmentMode',input.value);$('nextError').textContent='';updateAssignmentFields();}));
$('missionCrew').addEventListener('change',updateAssignmentFields);$('nextCrew').addEventListener('change',updateAssignmentFields);
setAssignmentMode('nextAssignmentMode',preferredAssignmentMode());setAssignmentMode('missionAssignmentMode',preferredAssignmentMode());updateAssignmentFields();
$('missionStreet').addEventListener('input',()=>{$('missionStreet').setCustomValidity('');renderStreetSuggestions();});
$('missionStreet').addEventListener('focus',renderStreetSuggestions);
$('missionStreet').addEventListener('blur',()=>setTimeout(closeStreetSuggestions,100));
$('missionStreet').addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeStreetSuggestions();return;}
  if(!['ArrowDown','ArrowUp','Enter'].includes(event.key))return;
  const open=!$('missionStreetSuggestions').classList.contains('hidden');
  if(event.key==='Enter'){
    if(open&&$('missionStreetSuggestions').children.length){event.preventDefault();$('missionStreetSuggestions').children[Math.max(0,streetSuggestionIndex)].click();}
    return;
  }
  if(!open)renderStreetSuggestions();
  if(!$('missionStreetSuggestions').children.length)return;
  event.preventDefault();highlightStreetSuggestion(streetSuggestionIndex<0?(event.key==='ArrowDown'?0:$('missionStreetSuggestions').children.length-1):streetSuggestionIndex+(event.key==='ArrowDown'?1:-1));
});

let catalogBusy=false;
function catalogLabels(){return [...$('natureRows').querySelectorAll('.edit-row')].map(row=>({code:row.querySelector('.nature-code').value.trim().toUpperCase(),label:row.querySelector('.nature-label').value.trim()}));}
async function saveCatalog(){
  if(catalogBusy)return false;
  const labels=catalogLabels(),error=$('manageError');error.textContent='';$('manageSuccess').textContent='';
  if(labels.some(x=>!x.code||!x.label)){error.textContent='Renseignez un code et un motif pour chaque ligne.';return false;}
  if(new Set(labels.map(x=>x.code)).size!==labels.length){error.textContent='Code utilisé plusieurs fois.';return false;}
  if(new Set(labels.map(x=>x.label.toLocaleLowerCase('fr-FR'))).size!==labels.length){error.textContent='Motif utilisé plusieurs fois.';return false;}
  catalogBusy=true;
  try{
    const d=await api('/portail/atlas/api/catalog/natures',{method:'POST',body:JSON.stringify({labels})});
    state.natures=d.natures||[];renderManage();$('manageSuccess').textContent='Codes et motifs enregistrés dans PHENIX et ATLAS.';return true;
  }catch(e){error.textContent=e.message;return false;}finally{catalogBusy=false;}
}
function editRow(value){
  const row=document.createElement('div');row.className='edit-row';
  const code=document.createElement('input');code.className='nature-code';code.placeholder='Code';code.maxLength=20;code.value=value.code||'';code.setAttribute('aria-label','Code intervention');
  const label=document.createElement('input');label.className='nature-label';label.placeholder='Motif d’intervention';label.maxLength=180;label.value=value.label||'';label.setAttribute('aria-label','Motif intervention');
  const save=button('Enregistrer','secondary',saveCatalog);
  const del=button('Supprimer','danger',async()=>{if(!confirm('Supprimer ce code et ce motif du catalogue ?'))return;const next=catalogLabels().filter((_,i)=>i!==[...$('natureRows').children].indexOf(row));if(!next.length){$('manageError').textContent='Le catalogue ne peut pas être vide.';return;}row.remove();if(!await saveCatalog())$('natureRows').append(row);});
  row.append(code,label,save,del);return row;
}
function renderManage(){$('natureRows').replaceChildren();state.natures.forEach(x=>$('natureRows').appendChild(editRow(x)));}
$('manageBtn').addEventListener('click',()=>{renderManage();$('manageError').textContent='';$('manageSuccess').textContent='';openModal('manageModal');});
$('addNatureBtn').addEventListener('click',()=>{const row=editRow({code:'',label:''});$('natureRows').appendChild(row);row.querySelector('input').focus();});
$('saveCatalogBtn').addEventListener('click',saveCatalog);

setInterval(()=>{document.querySelectorAll('.mission-card').forEach(card=>{const mission=state.missions.find(item=>item.id===card.dataset.missionId);if(mission)card.querySelector('.elapsed').textContent=elapsed(mission.startedAt||mission.departedAt);});},1000);
setInterval(()=>refresh(true),2000);
refresh();
