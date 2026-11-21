'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const AtlasBoard=require('../portail/atlas/board');

// Exécuter les gestionnaires réels avec des dépendances DOM et réseau simulées.
// Ces tests vérifient les contrats API ; ils ne remplacent pas un essai navigateur.
function client(onRequest){
  const nodes=new Map(),radios=new Map(),calls=[];
  let document;
  function node(id){
    if(nodes.has(id))return nodes.get(id);
    const classes=new Set(['missionModal','notificationsModal','manageModal','toast'].includes(id)?['hidden']:[]);
    const element={id,value:'',textContent:'',innerHTML:'',checked:false,disabled:false,dataset:{},style:{},inert:false,isConnected:true,events:{},
      classList:{add(...items){items.forEach(item=>classes.add(item));},remove(...items){items.forEach(item=>classes.delete(item));},contains(item){return classes.has(item);},toggle(item,force){const enabled=force===undefined?!classes.has(item):force;if(enabled)classes.add(item);else classes.delete(item);return enabled;}},
      addEventListener(event,handler){this.events[event]=handler;},focus(){document.activeElement=this;},querySelector(){return node(id+'-card');},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}
    };
    nodes.set(id,element);return element;
  }
  function group(name){
    if(!radios.has(name))radios.set(name,['auto','manual'].map(value=>Object.assign(node(name+'-'+value),{value,checked:value==='manual'})));
    return radios.get(name);
  }
  document={body:{style:{}},events:{},activeElement:null,getElementById:node,
    addEventListener(event,handler){this.events[event]=handler;},removeEventListener(){},
    querySelector(selector){
      const match=selector.match(/input\[name="([^"]+)"\]:checked/);
      if(match)return group(match[1]).find(input=>input.checked);
      if(selector==='.modal:not(.hidden)')return ['missionModal','notificationsModal','manageModal'].map(node).find(item=>!item.classList.contains('hidden'))||null;
      return node(selector);
    },
    querySelectorAll(selector){return [...new Set([...selector.matchAll(/input\[name="([^"]+)"\]/g)].map(match=>match[1]))].flatMap(group);}
  };
  document.activeElement=node('newMissionBtn');
  const payload={user:{id:'user',name:'Test',role:'operateur'},missions:[],crews:[{id:'c1',callsign:'ALPHA 1',status:'DISPO',assignable:true}],nextMissionId:'m1',canOperate:true,canManage:false,serverTime:Date.now(),notifications:{events:{'atlas-new-intervention':{soundEnabled:false,desktopEnabled:false}}}};
  const context=vm.createContext({document,window:{},navigator:{},location:{},Headers,AtlasBoard,console,
    localStorage:{getItem(){return 'false';},setItem(){}},setTimeout(){return 0;},clearTimeout(){},setInterval(){},
    confirm(){return true;},
    async fetch(url,options={}){
      const request={url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null};calls.push(request);
      const result=await onRequest?.(request);
      const status=result?.status||200;
      return {status,ok:status<400,async json(){return result?.data??payload;}};
    }
  });
  const source=fs.readFileSync(path.join(__dirname,'../portail/atlas/app.js'),'utf8');
  vm.runInContext(source.replace(/\nrefresh\(\);\s*$/,'')+'\nrenderAll=()=>{};renderMissions=()=>{};globalThis.clientApi={state,refresh,updateAssignmentFields,openModal,closeModal,setStatus};',context);
  function form(){
    node('missionNature').value='Stationnement gênant';node('missionPriority').value='NORMAL';node('missionStreet').value='Rue de l’Église';node('missionNumber').value='12 bis';node('missionNotes').value='Entrée du garage';
    return node('missionForm').events.submit({preventDefault(){}});
  }
  return {node,group,calls,payload,document,...context.clientApi,form};
}

test('La création manuelle sans patrouille conserve le contrat d’enregistrement en attente et la saisie BAN',async()=>{
  const ui=client();Object.assign(ui.state,ui.payload);
  await ui.form();
  const request=ui.calls.find(call=>call.method==='POST');
  assert.equal(request.url,'/portail/atlas/api/missions');
  assert.deepEqual(request.body,{natureCode:'',natureLabel:'Stationnement gênant',priority:'NORMAL',assignmentMode:'manual',crewId:'',number:'12 bis',street:'Rue de l’Église',complement:'',notes:'Entrée du garage'});
  assert.equal(ui.node('missionSubmit').disabled,false);
  assert.match(ui.node('toastMessage').textContent,/file d’attente/);
});

test('L’affectation automatique ne transmet pas une ancienne sélection manuelle',async()=>{
  const ui=client();Object.assign(ui.state,ui.payload);
  ui.group('missionAssignmentMode').forEach(input=>input.checked=input.value==='auto');
  ui.node('missionCrew').value='ancienne-patrouille';
  await ui.form();
  const request=ui.calls.find(call=>call.method==='POST');
  assert.equal(request.body.assignmentMode,'auto');assert.equal(request.body.crewId,'');
  assert.match(ui.node('toastMessage').textContent,/créée et affectée/);
});

test('Une création refusée conserve le formulaire et affiche le message du serveur',async()=>{
  const ui=client(request=>request.method==='POST'?{status:409,data:{message:'Aucune patrouille disponible.'}}:undefined);
  ui.openModal('missionModal');await ui.form();
  assert.equal(ui.node('missionModal').classList.contains('hidden'),false);
  assert.equal(ui.node('missionNature').value,'Stationnement gênant');
  assert.equal(ui.node('missionError').textContent,'Aucune patrouille disponible.');
  assert.equal(ui.node('missionSubmit').disabled,false);
});

test('Un double clic sur la prochaine affectation ne déclenche qu’une mutation',async()=>{
  let release;
  const ui=client(request=>request.method==='POST'?new Promise(resolve=>{release=resolve;}):undefined);
  Object.assign(ui.state,ui.payload);ui.node('nextCrew').value='c1';
  const click=ui.node('takeNextBtn').events.click;
  const first=click();await click();
  assert.equal(ui.node('takeNextBtn').disabled,true);
  assert.equal(ui.calls.filter(call=>call.method==='POST').length,1);
  release({data:{mission:{crewCallsign:'ALPHA 1'}}});await first;
  const request=ui.calls.find(call=>call.method==='POST');
  assert.equal(request.url,'/portail/atlas/api/next');
  assert.deepEqual(request.body,{assignmentMode:'manual',crewId:'c1'});
  assert.equal(ui.node('takeNextBtn').disabled,false);
});

test('Les actions sur place et terminer utilisent les statuts existants et encodent l’identifiant',async()=>{
  const ui=client();
  await ui.setStatus('mission / 1','ONSCENE');await ui.setStatus('mission / 1','DONE');
  const requests=ui.calls.filter(call=>call.method==='POST');
  assert.equal(requests[0].url,'/portail/atlas/api/missions/mission%20%2F%201/status');
  assert.deepEqual(requests.map(request=>request.body.status),['ONSCENE','DONE']);
});

test('Une panne après une lecture réussie garde les dernières données et affiche une alerte',async()=>{
  let offline=false;
  const ui=client(()=>offline?{status:503,data:{message:'Serveur indisponible.'}}:undefined);
  ui.payload.missions=[{id:'m1',status:'WAITING',priority:'URGENT'}];
  await ui.refresh();offline=true;await ui.refresh(true);
  assert.equal(ui.state.missions.length,1);
  assert.equal(ui.node('connectionAlert').classList.contains('hidden'),false);
  assert.match(ui.node('connectionMessage').textContent,/Dernière actualisation/);
  assert.equal(ui.node('syncState').textContent,'Connexion interrompue');
  offline=false;await ui.refresh(true);
  assert.equal(ui.node('connectionAlert').classList.contains('hidden'),true);
});

test('Le mode consultation masque l’affectation et le signale explicitement',async()=>{
  const ui=client();ui.payload.canOperate=false;ui.payload.user.role='consultation';
  await ui.refresh();ui.updateAssignmentFields();
  assert.equal(ui.node('nextAssignmentPanel').classList.contains('hidden'),true);
  assert.equal(ui.node('readOnlyPanel').classList.contains('hidden'),false);
  assert.equal(ui.node('takeNextBtn').disabled,true);
});

test('Une fenêtre bloque le fond et restitue le focus à sa fermeture',()=>{
  const ui=client(),opener=ui.node('newMissionBtn');
  ui.openModal('missionModal');
  assert.equal(ui.node('main').inert,true);assert.equal(ui.node('.topbar').inert,true);
  ui.closeModal('missionModal');
  assert.equal(ui.node('main').inert,false);assert.equal(ui.node('.topbar').inert,false);
  assert.equal(ui.document.activeElement,opener);
});
