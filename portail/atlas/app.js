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
const boardView = { query:'', priority:'all', order:'priority' };
const modalReturnFocus = new Map();
let atlasLoaded = false;
let atlasLastSync = 0;
let serverOffset = 0;
let toastTimer;
const roleLabels = { admin:'Administrateur', superviseur:'Superviseur', operateur:'Opérateur', consultation:'Consultation' };
function setText(id, value) { const node=$(id); if(node.textContent!==String(value))node.textContent=value; }
function icon(name) { return '<svg class="icon" aria-hidden="true"><use href="/portail/atlas/icons.svg#'+name+'"/></svg>'; }
function showToast(message, error=false) {
  clearTimeout(toastTimer);
  $('toastMessage').textContent=message;
  $('toast').classList.toggle('is-error',error);
  $('toast').classList.remove('hidden');
  toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),error?12000:6000);
}

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
function elapsed(from){return AtlasBoard.duration(from,Date.now()+serverOffset);}

function fullAddress(m){return [m.number,m.street,m.complement].filter(Boolean).join(' ');}
function statusLabel(s){return ({WAITING:'En attente',ASSIGNED:'En cours',DEPARTED:'En cours',IN_PROGRESS:'En cours',ONSCENE:'Sur place'})[s]||s;}
function priorityLabel(p){return p==='URGENT'?'Prioritaire':'Normale';}
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
  setText('notificationsLabel',atlasDesktopEnabled&&permission==='granted'?'Notifications activées':'Notifications');
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

function openModal(id){
  modalReturnFocus.set(id,document.activeElement);
  $(id).classList.remove('hidden');
  document.body.style.overflow='hidden';
  document.querySelector('.topbar').inert=true;
  $('main').inert=true;
  $(id).querySelector('.modal-card').focus();
}
function closeModal(id){
  $(id).classList.add('hidden');
  if(!document.querySelector('.modal:not(.hidden)')){
    document.body.style.overflow='';
    document.querySelector('.topbar').inert=false;
    $('main').inert=false;
    const previous=modalReturnFocus.get(id);
    if(previous?.isConnected)previous.focus({preventScroll:true});
  }
  modalReturnFocus.delete(id);
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-close]');
  if(b)closeModal(b.dataset.close);
  if(e.target.classList.contains('modal'))closeModal(e.target.id);
});
document.addEventListener('keydown',event=>{
  const modal=document.querySelector('.modal:not(.hidden)');
  if(!modal)return;
  if(event.key==='Escape'){event.preventDefault();closeModal(modal.id);return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length);
  const first=controls[0],last=controls[controls.length-1];
  if(!first){event.preventDefault();return;}
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal.querySelector('.modal-card'))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus();}
});

function populateSelects(){
  fillCrewSelect($('missionCrew'),'À affecter plus tard');
  fillCrewSelect($('nextCrew'),'Choisir une patrouille');
  const natureOptions=JSON.stringify(state.natures);
  if($('missionNatureSuggestions').dataset.options!==natureOptions){
    $('missionNatureSuggestions').dataset.options=natureOptions;
    $('missionNatureSuggestions').replaceChildren(...state.natures.map(nature=>{
      const option=document.createElement('option');option.value=nature.label;option.label=nature.code||'';return option;
    }));
  }
  updateAssignmentFields();
}

function crewAssignable(crew){return AtlasBoard.isCrewAssignable(crew,state.missions);}

function fillCrewSelect(select,placeholder){
  const selected=select.value;
  const crews=[...state.crews].sort((a,b)=>Number(crewAssignable(b))-Number(crewAssignable(a))||a.callsign.localeCompare(b.callsign,'fr',{numeric:true}));
  const options=`<option value="">${esc(placeholder)}</option>`+crews.map(crew=>`<option value="${esc(crew.id)}" ${crewAssignable(crew)?'':'disabled'}>${esc(crew.callsign)} — ${crewAssignable(crew)?'Disponible':'Indisponible'}</option>`).join('');
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
  const available=state.crews.filter(crewAssignable);
  $('nextCrewField').classList.toggle('hidden',nextAuto);
  $('missionCrewField').classList.toggle('hidden',missionAuto);
  $('missionAssignmentHelp').classList.toggle('hidden',!missionAuto);
  $('missionAssignmentHelp').textContent=available.length?'ATLAS choisira une patrouille disponible dès la création.':'Aucune patrouille disponible. Choisissez le mode manuel pour enregistrer en attente.';
  $('nextAssignmentPanel').classList.toggle('hidden',!state.canOperate);
  $('readOnlyPanel').classList.toggle('hidden',!atlasLoaded||state.canOperate);
  setText('nextAssignmentHelp',!state.nextMissionId?'La prochaine intervention apparaîtra ici.':!available.length?'Aucune patrouille disponible. L’intervention reste en attente.':nextAuto?'Une patrouille disponible sera choisie au clic sur Affecter.':'L’affectation démarre immédiatement l’intervention dans PHENIX.');
  setText('missionSubmit',missionAuto||$('missionCrew').value?'Créer et affecter':'Enregistrer en attente');
  setText('takeNextBtn',takeNextPending?'Affectation…':nextAuto?'Affecter automatiquement':'Affecter la patrouille');
  const selected=state.crews.find(crew=>String(crew.id)===String($('nextCrew').value));
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
  const mission=state.missions.find(item=>String(item.id)===String(state.nextMissionId));
  document.querySelector('.hero-grid').classList.toggle('has-urgent',mission?.priority==='URGENT');
  if(!mission){
    box.innerHTML='<div class="empty-next"><strong>La file d’attente est à jour</strong>Aucune intervention à affecter pour le moment.</div>';
    return;
  }
  box.innerHTML='<div class="next-summary"><h3>'+esc(mission.natureLabel)+'</h3><p class="next-address">'+icon('pin')+'<span>'+esc(fullAddress(mission))+'</span></p><div class="next-meta"><span class="next-priority '+(mission.priority==='URGENT'?'urgent':'normal')+'">'+priorityLabel(mission.priority)+'</span><span>Créée à '+esc(fmtTime(mission.createdAt))+'</span><span>En attente depuis <strong class="next-wait">'+esc(elapsed(mission.createdAt))+'</strong></span></div></div>';
}

function missionClock(mission){return mission.status==='WAITING'?mission.createdAt:mission.startedAt||mission.departedAt||mission.assignedAt;}
function missionCard(m){
  const fragment=$('missionTemplate').content.cloneNode(true);
  const card=fragment.querySelector('.mission-card');
  card.dataset.missionId=m.id;
  card.classList.add(m.priority==='URGENT'?'urgent':'normal');
  card.classList.toggle('is-active',AtlasBoard.activeStatuses.has(m.status));
  card.classList.toggle('is-onscene',m.status==='ONSCENE');
  fragment.querySelector('.priority-label').textContent=priorityLabel(m.priority);
  fragment.querySelector('.nature').textContent=(m.natureCode?m.natureCode+' · ':'')+m.natureLabel;
  fragment.querySelector('.status-badge').textContent=statusLabel(m.status);
  fragment.querySelector('.address').textContent=fullAddress(m)||'Adresse non renseignée';
  const notes=fragment.querySelector('.notes');notes.textContent=m.notes||'';notes.classList.toggle('hidden',!m.notes);
  fragment.querySelector('.created').textContent=fmtTime(m.createdAt);
  fragment.querySelector('.created').title=new Date(m.createdAt).toLocaleString('fr-FR');
  const liveCrew=crewById(m.crewId);
  fragment.querySelector('.crew').textContent=m.crewCallsign||liveCrew?.callsign||'À affecter';
  if(m.crewId&&!liveCrew)fragment.querySelector('.crew').textContent+=' · absente de PHENIX';
  fragment.querySelector('.elapsed-label').textContent=m.status==='WAITING'?'Temps d’attente':'Durée d’intervention';
  fragment.querySelector('.elapsed').textContent=elapsed(missionClock(m));
  const actions=fragment.querySelector('.mission-actions');
  if(m.status==='WAITING'&&!m.crewId&&state.canOperate){
    const details=document.createElement('details');details.className='mission-dispatch';
    const summary=document.createElement('summary');summary.innerHTML=icon('crew')+'Affecter une patrouille';
    summary.setAttribute('aria-label','Affecter une patrouille pour '+m.natureLabel);
    details.append(summary,missionAssignmentForm(m));
    details.open=Boolean(assignmentChoices.get(m.id)?.expanded);
    details.addEventListener('toggle',()=>{const choice=assignmentChoices.get(m.id);if(choice)choice.expanded=details.open;});
    actions.append(details);
  }else if(AtlasBoard.activeStatuses.has(m.status)&&state.canOperate){
    if(m.status!=='ONSCENE')actions.append(button('Sur place','onscene',()=>setStatus(m.id,'ONSCENE')));
    actions.append(button('Terminer','done',()=>setStatus(m.id,'DONE')));
  }
  if(state.canManage)actions.append(button('Supprimer','danger',()=>deleteMission(m.id)));
  return fragment;
}
function button(label,kind,fn){
  const element=document.createElement('button');element.type='button';element.className='btn '+kind;element.textContent=label;
  element.addEventListener('click',async()=>{if(element.disabled)return;element.disabled=true;try{await fn();}finally{element.disabled=false;}});
  return element;
}

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
    const selected=state.crews.find(crew=>String(crew.id)===String(choice.crewId));
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
      assignmentChoices.delete(mission.id);showToast('Intervention affectée à la patrouille.');await refreshAfterMutation();
    }catch(e){error.textContent=e.message;}
    finally{assignmentPending.delete(mission.id);submit.textContent='Affecter';update();}
  });
  update();return form;
}

function renderMissions(){
  if(!atlasLoaded)return;
  const total=AtlasBoard.summary(state.missions,state.crews);
  const visible=AtlasBoard.selectMissions(state.missions,boardView,state.crews);
  const waiting=visible.filter(mission=>mission.status==='WAITING');
  const active=visible.filter(mission=>AtlasBoard.activeStatuses.has(mission.status));
  setText('waitingCount',total.waiting);setText('activeCount',total.active);
  setText('urgentCount',total.urgent);setText('availableCount',total.available);
  $('urgentStat').classList.toggle('has-urgent',total.urgent>0);
  setText('crewCountHelp',total.available+' disponible'+(total.available>1?'s':'')+' sur '+state.crews.length+' patrouille'+(state.crews.length>1?'s':''));
  setText('waitingVisible',waiting.length);setText('activeVisible',active.length);
  const count=waiting.length+active.length,all=total.waiting+total.active;
  const filtered=Boolean(boardView.query.trim())||boardView.priority!=='all';
  setText('boardResult',filtered?count+' intervention'+(count>1?'s':'')+' affichée'+(count>1?'s':'')+' sur '+all:all+' intervention'+(all>1?'s':'')+' à suivre');
  $('missionBoard').setAttribute('aria-busy','false');
  for(const [id,missions] of [['waitingList',waiting],['activeList',active]]){
    const list=$(id),key=JSON.stringify([missions,state.crews,state.canOperate,state.canManage,boardView]);
    if(list.dataset.renderKey===key)continue;
    const focused=document.activeElement,focusedCard=focused?.closest('.mission-card');
    const focusedId=list.contains(focusedCard)?focusedCard.dataset.missionId:null;
    const controlIndex=focusedId?[...focusedCard.querySelectorAll('button,input,select,summary')].indexOf(focused):-1;
    list.dataset.renderKey=key;list.replaceChildren();
    if(!missions.length){
      const empty=document.createElement('div');empty.className='empty-list';
      empty.innerHTML=icon(filtered?'search':id==='waitingList'?'check':'activity')+'<strong>'+(filtered?'Aucune intervention correspondante':id==='waitingList'?'Aucune intervention en attente':'Aucune intervention en cours')+'</strong><span>'+(filtered?'Essayez un autre terme ou retirez les filtres.':id==='waitingList'?'Les nouvelles interventions apparaîtront ici.':'Les interventions affectées apparaîtront ici.')+'</span>';
      if(filtered)empty.append(button('Réinitialiser les filtres','ghost',resetBoardFilters));
      else if(id==='waitingList'&&state.canOperate)empty.append(button('Créer une intervention','ghost',()=>$('newMissionBtn').click()));
      list.append(empty);
    }else missions.forEach(mission=>list.appendChild(missionCard(mission)));
    if(focusedId&&controlIndex>=0){
      const replacement=[...list.querySelectorAll('.mission-card')].find(card=>card.dataset.missionId===focusedId);
      replacement?.querySelectorAll('button,input,select,summary')[controlIndex]?.focus({preventScroll:true});
    }
  }
  for(const id of assignmentChoices.keys())if(!state.missions.some(m=>m.id===id&&m.status==='WAITING'))assignmentChoices.delete(id);
}

function renderCrews(){
  const list=$('crewList'),key=JSON.stringify([state.crews,state.missions.map(m=>[m.crewId,m.status])]);
  if(list.dataset.renderKey===key)return;
  list.dataset.renderKey=key;list.replaceChildren();
  if(!state.crews.length){list.innerHTML='<span class="muted">Aucune patrouille active dans PHENIX pour le moment.</span>';return;}
  [...state.crews].sort((a,b)=>Number(crewAssignable(b))-Number(crewAssignable(a))||a.callsign.localeCompare(b.callsign,'fr',{numeric:true})).forEach(crew=>{
    const available=crewAssignable(crew),active=state.missions.find(m=>String(m.crewId)===String(crew.id)&&AtlasBoard.activeStatuses.has(m.status));
    const chip=document.createElement('div');chip.className='crew-chip'+(available?'':' unavailable');
    chip.innerHTML='<span class="availability-dot" aria-hidden="true"></span><strong>'+esc(crew.callsign)+'</strong><span>'+(available?'Disponible':active?'En intervention':'Indisponible')+'</span>';
    list.append(chip);
  });
}

function resetBoardFilters(){
  boardView.query='';boardView.priority='all';$('missionSearch').value='';
  $('clearSearchBtn').classList.add('hidden');
  updatePriorityFilters();renderMissions();
}
function updatePriorityFilters(){
  document.querySelectorAll('[data-priority]').forEach(button=>{
    const selected=button.dataset.priority===boardView.priority;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
}
function updateClocks(){
  document.querySelectorAll('.mission-card').forEach(card=>{
    const mission=state.missions.find(item=>String(item.id)===card.dataset.missionId);
    if(mission)card.querySelector('.elapsed').textContent=elapsed(missionClock(mission));
  });
  const next=state.missions.find(item=>String(item.id)===String(state.nextMissionId));
  const timer=document.querySelector('.next-wait');if(next&&timer)timer.textContent=elapsed(next.createdAt);
}
function renderAll(){
  applyAppearance();
  setText('currentUser',state.user?state.user.name+' · '+(roleLabels[state.user.role]||state.user.role):'—');
  $('manageBtn').classList.toggle('hidden',!state.canManage);
  $('newMissionBtn').classList.toggle('hidden',!state.canOperate);
  populateSelects();renderNext();renderMissions();renderCrews();
  updateAtlasNotificationControls();
}

function applyAppearance(){
  const a=state.appearance;if(!a)return;
  document.documentElement.style.setProperty('--blue',a.primaryColor||'#1683c5');
  document.documentElement.style.setProperty('--blue2',a.accentColor||'#0d6597');
  document.documentElement.style.setProperty('--bg',a.backgroundColor||'#edf1f3');
  const title=document.querySelector('.brand strong'),subtitle=document.querySelector('.brand span'),logo=document.querySelector('.brand-logo');
  if(title)title.textContent=a.title||'ATLAS';
  if(subtitle)subtitle.textContent=a.subtitle||'Coordination des interventions';
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
      Object.assign(state,d);atlasLoaded=true;atlasLastSync=Date.now();
      serverOffset=(Number(d.serverTime)||Date.now())-Date.now();
      setText('syncState','PHENIX connecté');$('syncState').classList.add('connected');$('syncState').classList.remove('disconnected');
      $('connectionAlert').classList.add('hidden');setText('lastSync','Actualisé à '+fmtTime(atlasLastSync));
      renderAll();
      if(atlasSoundEnabled&&atlasNotificationRule().soundEnabled!==false)loadAtlasAudio().catch(()=>{});
      await Promise.allSettled(arrived.map(announceAtlasMission));
    }catch(e){
      setText('syncState','Connexion interrompue');$('syncState').classList.add('disconnected');$('syncState').classList.remove('connected');
      $('connectionAlert').classList.remove('hidden');
      setText('connectionMessage',(atlasLastSync?'Dernière actualisation à '+fmtTime(atlasLastSync)+'. Les informations affichées peuvent avoir changé. ':'')+e.message);
      if(!atlasLoaded){
        $('missionBoard').setAttribute('aria-busy','false');setText('boardResult','Chargement indisponible');
        $('waitingList').innerHTML='<div class="empty-list">La file d’attente sera affichée dès le retour de la connexion.</div>';
        $('activeList').innerHTML='<div class="empty-list">Le suivi sera affiché dès le retour de la connexion.</div>';
        $('nextMissionBox').innerHTML='<div class="empty-next">Connexion nécessaire pour charger la prochaine intervention.</div>';
        $('crewList').textContent='Disponibilités momentanément indisponibles.';
      }
    }
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
    closeModal('missionModal');resetBoardFilters();showToast(assignmentMode==='auto'||$('missionCrew').value?'Intervention créée et affectée.':'Intervention enregistrée dans la file d’attente.');await refreshAfterMutation();
  }catch(err){$('missionError').textContent=err.message;}finally{submit.disabled=false;}
});

async function setStatus(id,status){
  try{
    await api('/portail/atlas/api/missions/'+encodeURIComponent(id)+'/status',{method:'POST',body:JSON.stringify({status})});
    showToast(status==='DONE'?'Intervention terminée.':'La patrouille est signalée sur place.');
    await refreshAfterMutation();
  }catch(error){showToast(error.message,true);}
}
async function deleteMission(id){
  if(!confirm('Supprimer cette intervention ?'))return;
  try{
    await api('/portail/atlas/api/missions/'+encodeURIComponent(id),{method:'DELETE'});
    showToast('Intervention supprimée.');await refreshAfterMutation();
  }catch(error){showToast(error.message,true);}
}

$('takeNextBtn').addEventListener('click',async()=>{
  if(takeNextPending)return;
  takeNextPending=true;$('nextError').textContent='';updateAssignmentFields();
  const assignmentMode=selectedAssignmentMode('nextAssignmentMode');
  try{const d=await api('/portail/atlas/api/next',{method:'POST',body:JSON.stringify({assignmentMode,crewId:assignmentMode==='manual'?$('nextCrew').value:''})});if(!d.mission)$('nextError').textContent='Aucune intervention en attente.';else showToast('Intervention affectée à '+(d.mission.crewCallsign||'la patrouille')+'.');await refreshAfterMutation();}
  catch(e){$('nextError').textContent=e.message;}finally{takeNextPending=false;updateAssignmentFields();}
});
document.querySelectorAll('input[name="nextAssignmentMode"], input[name="missionAssignmentMode"]').forEach(input=>input.addEventListener('change',()=>{localStorage.setItem('atlasAssignmentMode',input.value);$('nextError').textContent='';updateAssignmentFields();}));
$('missionCrew').addEventListener('change',updateAssignmentFields);$('nextCrew').addEventListener('change',updateAssignmentFields);
setAssignmentMode('nextAssignmentMode',preferredAssignmentMode());setAssignmentMode('missionAssignmentMode',preferredAssignmentMode());updateAssignmentFields();
$('missionStreet').addEventListener('input',()=>{$('missionStreet').setCustomValidity('');renderStreetSuggestions();});
$('missionStreet').addEventListener('focus',renderStreetSuggestions);
$('missionStreet').addEventListener('blur',()=>setTimeout(closeStreetSuggestions,100));
$('missionStreet').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('missionStreetSuggestions').classList.contains('hidden')){event.stopPropagation();event.preventDefault();closeStreetSuggestions();return;}
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

$('missionSearch').addEventListener('input',event=>{
  boardView.query=event.target.value;$('clearSearchBtn').classList.toggle('hidden',!boardView.query);renderMissions();
});
$('clearSearchBtn').addEventListener('click',()=>{boardView.query='';$('missionSearch').value='';$('clearSearchBtn').classList.add('hidden');renderMissions();$('missionSearch').focus();});
document.querySelectorAll('[data-priority]').forEach(button=>button.addEventListener('click',()=>{boardView.priority=button.dataset.priority;updatePriorityFilters();renderMissions();}));
$('missionSort').addEventListener('change',event=>{boardView.order=event.target.value;renderMissions();});
$('retryBtn').addEventListener('click',async()=>{const button=$('retryBtn');button.disabled=true;try{await refresh(true);}finally{button.disabled=false;}});
$('closeToastBtn').addEventListener('click',()=>$('toast').classList.add('hidden'));
setInterval(updateClocks,1000);
setInterval(()=>refresh(true),2000);
refresh();
