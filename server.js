const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB = "/var/data/data.json";

function baseData(){
  return {
    users: [],
    agents: Array.from({length:150}, (_,i)=>({matricule:String(i+1).padStart(2,'0'), nom:'', prenom:'', actif:true})),
    callsigns: ['TV ALPHA','TV BRAVO','TV CHARLY','TV DELTA','TC ECHO','TV HOTEL','TV INDIA','TM MIKE','TP PAPA','TV VICTOR'],
    interventions: ['Accident','Cambriolage','Différend familial','Contrôle routier','Assistance personne','Renfort','Patrouille'],
    crews: [],
    logs: [],
    notes: {},
    consignes: [],
    links: [],
    flash: { enabled:false, title:'INFO', text:'' }
  };
}

function migrate(d){
  d.users=d.users||[];
  d.agents=d.agents||baseData().agents;
  d.callsigns=d.callsigns||baseData().callsigns;
  d.interventions=d.interventions||baseData().interventions;
  d.crews=d.crews||[];
  d.logs=d.logs||[];
  d.notes=d.notes||{};
  d.consignes=d.consignes||[];
  d.links=d.links||[];
  d.flash=d.flash||{enabled:false,title:'INFO',text:''};
  if(typeof d.flash.enabled!=='boolean') d.flash.enabled=false;
  d.flash.title=String(d.flash.title||'INFO').trim()||'INFO';
  d.flash.text=String(d.flash.text||'');
  d.users.forEach(u=>{ if(!u.brigades) u.brigades={jour:true,nuit:true}; });
  return d;
}

function load(){ try { return migrate(JSON.parse(fs.readFileSync(DB,'utf8'))); } catch(e){ const d=baseData(); save(d); return d; } }
function save(d){ fs.writeFileSync(DB, JSON.stringify(d,null,2)); }
function safe(u){ return u ? {id:u.id, login:u.login, displayName:u.displayName, role:u.role, brigades:u.brigades||{jour:true,nuit:true}} : null; }
function current(req){ const d=load(); return d.users.find(u=>u.id===req.session.userId); }
function needLogin(req,res,next){ if(!req.session.userId) return res.status(401).json({error:'Session expirée ou non connecté'}); next(); }
function needAdmin(req,res,next){ const u=current(req); if(!u || u.role!=='admin') return res.status(403).json({error:'Réservé admin'}); next(); }
function needOperational(req,res,next){ const u=current(req); if(!u || u.role==='dashboard') return res.status(403).json({error:'Accès lecture seule'}); next(); }
function needConsigneManager(req,res,next){ const u=current(req); if(!u || !['admin','superviseur'].includes(u.role)) return res.status(403).json({error:'Réservé superviseur/admin'}); next(); }
function audit(d, req, msg){ const u=current(req); d.logs.unshift({date:new Date().toISOString(), userId:u?u.id:null, user:u?u.displayName:'Système', msg}); d.logs=d.logs.slice(0,2000); }

function atFour(date=new Date()){ const d=new Date(date); d.setHours(4,0,0,0); return d; }

function visibleConsigne(c,u){
  if(['admin','superviseur'].includes(u.role)) return true;
  const b=u.brigades||{};
  if(c.brigade==='all') return true;
  if(c.brigade==='jour') return !!b.jour;
  if(c.brigade==='nuit') return !!b.nuit;
  return true;
}

function activeConsigne(c){
  const now=new Date();
  if(c.startDate){ const s=new Date(c.startDate+'T00:00:00'); if(now<s) return false; }
  if(c.endDate){ const e=new Date(c.endDate+'T23:59:59'); if(now>e) return false; }
  return true;
}

function readLimit(c){
  const now=new Date();
  if(c.recurrence==='daily'){ const f=atFour(now); if(now<f) f.setDate(f.getDate()-1); return f; }
  if(c.recurrence==='weekly'){
    const days=Array.isArray(c.days)?c.days:[];
    const d=atFour(now);
    for(let i=0;i<8;i++){ const x=new Date(d); x.setDate(d.getDate()-i); if(days.includes(x.getDay()) && now>=x) return x; }
  }
  return new Date(c.createdAt||0);
}

function consignesForUser(d,u){
  return (d.consignes||[]).filter(c=>activeConsigne(c)&&visibleConsigne(c,u)).map(c=>{
    const limit=readLimit(c);
    const readAt=c.reads&&c.reads[u.id]?new Date(c.reads[u.id]):null;
    const read=!!(readAt && readAt>=limit);
    return {...c, read, unread:!read};
  });
}


function visibleLink(l,u){
  if(['admin','superviseur'].includes(u.role)) return true;
  const b=u.brigades||{};
  const v=l.visible||{};
  if(!v.jour && !v.nuit) return true;
  return (v.jour&&b.jour)||(v.nuit&&b.nuit);
}
function linksForUser(d,u){
  return (d.links||[]).filter(l=>visibleLink(l,u));
}

function cleanLogo(v){
  let s=String(v||'🔗').trim();
  // Si l'utilisateur a copié/collé avec l'icône par défaut devant, on la retire
  s=s.replace(/^🔗\s*/,'').trim();
  if(!s) s='🔗';
  return s;
}


app.use(express.json({limit:'4mb'}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'pegase-session-secret-v22',
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite:'lax', maxAge: 1000*60*60*12 }
}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/status', (req,res)=>{
  const d=load();
  res.json({
    setupRequired:d.users.length===0,
    user:safe(current(req)),
    flash:d.flash||{enabled:false,title:'INFO',text:''}
  });
});

app.post('/api/setup', (req,res)=>{
  const d=load();
  if(d.users.length>0) return res.status(403).json({error:'Le premier compte admin existe déjà'});
  const {displayName,login,password}=req.body||{};
  if(!displayName || !login || !password) return res.status(400).json({error:'Nom, identifiant et mot de passe obligatoires'});
  if(String(password).length < 4) return res.status(400).json({error:'Mot de passe trop court : minimum 4 caractères'});
  const u={id:Date.now().toString(), displayName:String(displayName).trim(), login:String(login).trim(), role:'admin', brigades:{jour:true,nuit:true}, passwordHash:bcrypt.hashSync(String(password),10)};
  d.users.push(u); audit(d,req,'Création du premier admin'); save(d); req.session.userId=u.id; audit(d,req,'Connexion'); save(d); res.json({ok:true,user:safe(u)});
});

app.post('/api/login', (req,res)=>{
  const d=load(); const {login,password}=req.body||{};
  const u=d.users.find(x=>x.login===String(login||'').trim());
  if(!u || !bcrypt.compareSync(String(password||''), u.passwordHash)) return res.status(401).json({error:'Identifiant ou mot de passe incorrect'});
  req.session.userId=u.id; audit(d,req,'Connexion'); save(d); res.json({ok:true,user:safe(u)});
});

app.post('/api/logout', (req,res)=>{ const d=load(); audit(d,req,'Déconnexion'); save(d); req.session.destroy(()=>res.json({ok:true})); });

app.post('/api/password', needLogin, (req,res)=>{
  const d=load(); const u=d.users.find(x=>x.id===req.session.userId);
  if(!bcrypt.compareSync(String(req.body.oldPassword||''), u.passwordHash)) return res.status(400).json({error:'Ancien mot de passe incorrect'});
  if(!req.body.newPassword || String(req.body.newPassword).length<4) return res.status(400).json({error:'Nouveau mot de passe trop court'});
  u.passwordHash=bcrypt.hashSync(String(req.body.newPassword),10); audit(d,req,'Changement de mot de passe'); save(d); res.json({ok:true});
});

app.get('/api/data', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  res.json({
    user:safe(u),
    agents:d.agents,
    callsigns:d.callsigns,
    interventions:d.interventions,
    crews:d.crews,
    logs:d.logs.slice(0,100),
    note:d.notes[u.id]||'',
    consignes:consignesForUser(d,u),
    links:linksForUser(d,u),
    flash:d.flash||{enabled:false,title:'INFO',text:''},
    users:['admin','superviseur'].includes(u.role)?d.users.map(safe):undefined
  });
});

app.post('/api/note', needLogin, needOperational, (req,res)=>{
  const d=load();
  d.notes[req.session.userId]=String(req.body.note||'');
  audit(d,req,'Modification notes privées');
  save(d);
  res.json({ok:true});
});

app.post('/api/agents', needLogin, needAdmin, (req,res)=>{
  const d=load();
  d.agents=Array.isArray(req.body.agents)?req.body.agents:d.agents;
  audit(d,req,'Mise à jour personnel');
  save(d);
  res.json({ok:true});
});

app.post('/api/crew', needLogin, needOperational, (req,res)=>{
  const d=load(); const c=req.body.crew||{};
  if(!c.callsign) return res.status(400).json({error:'Indicatif obligatoire'});

  if(c.id){
    const i=d.crews.findIndex(x=>x.id===c.id);
    if(i<0) return res.status(404).json({error:'Équipage introuvable'});
    d.crews[i]={...d.crews[i], callsign:c.callsign, matricules:c.matricules||[], observations:c.observations||'', meal:c.meal||''};
    audit(d,req,'Modification équipage '+c.callsign);
  } else {
    d.crews.push({id:Date.now().toString(), callsign:c.callsign, matricules:c.matricules||[], observations:c.observations||'', meal:c.meal||'', status:'DISPO', intervention:''});
    audit(d,req,'Création équipage '+c.callsign);
  }

  save(d);
  res.json({ok:true});
});

app.delete('/api/crew/:id', needLogin, needOperational, (req,res)=>{
  const d=load();
  const c=d.crews.find(x=>x.id===req.params.id);
  d.crews=d.crews.filter(x=>x.id!==req.params.id);
  if(c) audit(d,req,'Suppression équipage '+c.callsign);
  save(d);
  res.json({ok:true});
});

app.post('/api/crew/:id/status', needLogin, needOperational, (req,res)=>{
  const d=load();
  const c=d.crews.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({error:'Équipage introuvable'});
  c.status=req.body.status==='INDISPO'?'INDISPO':'DISPO';
  c.intervention=c.status==='INDISPO'?String(req.body.intervention||'Intervention'):'';
  audit(d,req,`${c.callsign} ${c.status}${c.intervention?' - '+c.intervention:''}`);
  save(d);
  res.json({ok:true});
});

app.post('/api/consignes', needLogin, needConsigneManager, (req,res)=>{
  const d=load(); const u=current(req); const r=req.body||{};
  if(!String(r.title||'').trim()) return res.status(400).json({error:'Titre obligatoire'});
  if(!String(r.body||'').trim()) return res.status(400).json({error:'Texte obligatoire'});

  const data={
    title:String(r.title).trim(),
    body:String(r.body).trim(),
    brigade:['jour','nuit','all'].includes(r.brigade)?r.brigade:'all',
    priority:['info','important','urgent'].includes(r.priority)?r.priority:'info',
    startDate:String(r.startDate||''),
    endDate:String(r.endDate||''),
    recurrence:['none','daily','weekly'].includes(r.recurrence)?r.recurrence:'none',
    days:Array.isArray(r.days)?r.days.map(Number).filter(x=>x>=0&&x<=6):[],
    updatedAt:new Date().toISOString(),
    updatedBy:u.displayName
  };

  if(r.id){
    const c=d.consignes.find(x=>x.id===r.id);
    if(!c) return res.status(404).json({error:'Consigne introuvable'});
    Object.assign(c,data);
    audit(d,req,'Modification consigne '+c.title);
  } else {
    d.consignes.unshift({id:Date.now().toString(), createdAt:new Date().toISOString(), createdBy:u.displayName, reads:{}, ...data});
    audit(d,req,'Création consigne '+data.title);
  }

  save(d);
  res.json({ok:true});
});

app.post('/api/consignes/:id/read', needLogin, (req,res)=>{
  const d=load();
  const c=d.consignes.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({error:'Consigne introuvable'});
  c.reads=c.reads||{};
  c.reads[req.session.userId]=new Date().toISOString();
  save(d);
  res.json({ok:true});
});

app.delete('/api/consignes/:id', needLogin, needConsigneManager, (req,res)=>{
  const d=load();
  const c=d.consignes.find(x=>x.id===req.params.id);
  d.consignes=d.consignes.filter(x=>x.id!==req.params.id);
  if(c) audit(d,req,'Suppression consigne '+c.title);
  save(d);
  res.json({ok:true});
});

app.post('/api/admin/flash', needLogin, needAdmin, (req,res)=>{
  const d=load();
  d.flash={
    enabled: !!req.body.enabled,
    title: String(req.body.title||'INFO').trim() || 'INFO',
    text: String(req.body.text||'').trim()
  };
  audit(d,req,'Modification texte flash');
  save(d);
  res.json({ok:true, flash:d.flash});
});


app.post('/api/links', needLogin, needConsigneManager, (req,res)=>{
  const d=load(); const r=req.body||{};
  if(!String(r.name||'').trim()) return res.status(400).json({error:'Nom du lien obligatoire'});
  if(!String(r.url||'').trim()) return res.status(400).json({error:'URL obligatoire'});
  const data={
    name:String(r.name).trim(),
    url:String(r.url).trim(),
    logo:cleanLogo(r.logo),
    description:String(r.description||'').trim(),
    visible:{
      jour:!!(r.visible&&r.visible.jour),
      nuit:!!(r.visible&&r.visible.nuit)
    },
    updatedAt:new Date().toISOString()
  };
  if(r.id){
    const l=d.links.find(x=>x.id===r.id);
    if(!l) return res.status(404).json({error:'Lien introuvable'});
    Object.assign(l,data);
    audit(d,req,'Modification lien utile '+data.name);
  } else {
    d.links.unshift({id:Date.now().toString(), createdAt:new Date().toISOString(), ...data});
    audit(d,req,'Création lien utile '+data.name);
  }
  save(d); res.json({ok:true});
});

app.delete('/api/links/:id', needLogin, needConsigneManager, (req,res)=>{
  const d=load();
  const l=d.links.find(x=>x.id===req.params.id);
  d.links=d.links.filter(x=>x.id!==req.params.id);
  if(l) audit(d,req,'Suppression lien utile '+l.name);
  save(d); res.json({ok:true});
});

app.get('/api/history/:userId', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!u || !['admin','superviseur'].includes(u.role)) return res.status(403).json({error:'Réservé superviseur/admin'});
  const since=Date.now()-7*24*60*60*1000;
  const logs=(d.logs||[]).filter(l=>{
    const t=new Date(l.date).getTime();
    return t>=since && (l.userId===req.params.userId || (!l.userId && d.users.find(x=>x.id===req.params.userId && x.displayName===l.user)));
  });
  res.json({logs});
});


app.get('/api/logo-check/:file', needLogin, (req,res)=>{
  const file=String(req.params.file||'').replace(/[^a-zA-Z0-9_.-]/g,'');
  const full=path.join(__dirname,'public',file);
  res.json({file, exists:fs.existsSync(full), path:'/'.concat(file)});
});

app.post('/api/admin/users', needLogin, needAdmin, (req,res)=>{
  const d=load(); const r=req.body||{};
  if(!r.displayName||!r.login||!r.role) return res.status(400).json({error:'Nom, identifiant et rôle obligatoires'});
  if(!['admin','superviseur','operateur','dashboard'].includes(r.role)) return res.status(400).json({error:'Rôle invalide'});

  const brigades={jour:!!(r.brigades&&r.brigades.jour), nuit:!!(r.brigades&&r.brigades.nuit)};
  if(['admin','superviseur'].includes(r.role)){ brigades.jour=true; brigades.nuit=true; }

  if(r.id){
    const u=d.users.find(x=>x.id===r.id);
    if(!u) return res.status(404).json({error:'Utilisateur introuvable'});
    u.displayName=r.displayName;
    u.login=r.login;
    u.role=r.role;
    u.brigades=brigades;
    if(r.password) u.passwordHash=bcrypt.hashSync(String(r.password),10);
  } else {
    if(!r.password) return res.status(400).json({error:'Mot de passe obligatoire pour créer'});
    if(d.users.some(u=>u.login===r.login)) return res.status(400).json({error:'Identifiant déjà utilisé'});
    d.users.push({id:Date.now().toString(), displayName:r.displayName, login:r.login, role:r.role, brigades, passwordHash:bcrypt.hashSync(String(r.password),10)});
  }

  audit(d,req,'Gestion utilisateur');
  save(d);
  res.json({ok:true});
});

app.delete('/api/admin/users/:id', needLogin, needAdmin, (req,res)=>{
  const d=load();
  if(req.params.id===req.session.userId) return res.status(400).json({error:'Impossible de supprimer ton compte connecté'});
  d.users=d.users.filter(u=>u.id!==req.params.id);
  audit(d,req,'Suppression utilisateur');
  save(d);
  res.json({ok:true});
});

app.post('/api/admin/lists', needLogin, needAdmin, (req,res)=>{
  const d=load();
  d.callsigns=Array.isArray(req.body.callsigns)?req.body.callsigns:d.callsigns;
  d.interventions=Array.isArray(req.body.interventions)?req.body.interventions:d.interventions;
  audit(d,req,'Modification listes admin');
  save(d);
  res.json({ok:true});
});

app.listen(PORT,()=>console.log('PEGASE V33 logos liens utiles corrigés sur le port '+PORT));
