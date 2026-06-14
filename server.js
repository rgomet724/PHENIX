const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, 'data.json');

function baseData(){
  return {
    users: [],
    agents: Array.from({length:150}, (_,i)=>({matricule:String(i+1).padStart(2,'0'), nom:'', prenom:'', actif:true})),
    callsigns: ['TV ALPHA','TV BRAVO','TV CHARLY','TV DELTA','TC ECHO','TV HOTEL','TV INDIA','TM MIKE','TP PAPA','TV VICTOR'],
    interventions: ['Accident','Cambriolage','Différend familial','Contrôle routier','Assistance personne','Renfort','Patrouille'],
    crews: [],
    logs: [],
    notes: {}
  };
}
function load(){ try { return JSON.parse(fs.readFileSync(DB,'utf8')); } catch(e){ const d=baseData(); save(d); return d; } }
function save(d){ fs.writeFileSync(DB, JSON.stringify(d,null,2)); }
function safe(u){ return u ? {id:u.id, login:u.login, displayName:u.displayName, role:u.role} : null; }
function current(req){ const d=load(); return d.users.find(u=>u.id===req.session.userId); }
function needLogin(req,res,next){ if(!req.session.userId) return res.status(401).json({error:'Session expirée ou non connecté'}); next(); }
function needAdmin(req,res,next){ const u=current(req); if(!u || u.role!=='admin') return res.status(403).json({error:'Réservé admin'}); next(); }
function audit(d, req, msg){ const u=current(req); d.logs.unshift({date:new Date().toISOString(), user:u?u.displayName:'Système', msg}); d.logs=d.logs.slice(0,500); }

app.use(express.json({limit:'4mb'}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'pegase-session-secret-v22',
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite:'lax', maxAge: 1000*60*60*12 }
}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/status', (req,res)=>{ const d=load(); res.json({setupRequired:d.users.length===0, user:safe(current(req))}); });
app.post('/api/setup', (req,res)=>{
  const d=load();
  if(d.users.length>0) return res.status(403).json({error:'Le premier compte admin existe déjà'});
  const {displayName,login,password}=req.body||{};
  if(!displayName || !login || !password) return res.status(400).json({error:'Nom, identifiant et mot de passe obligatoires'});
  if(String(password).length < 4) return res.status(400).json({error:'Mot de passe trop court : minimum 4 caractères'});
  const u={id:Date.now().toString(), displayName:String(displayName).trim(), login:String(login).trim(), role:'admin', passwordHash:bcrypt.hashSync(String(password),10)};
  d.users.push(u); audit(d,req,'Création du premier admin'); save(d); req.session.userId=u.id; res.json({ok:true,user:safe(u)});
});
app.post('/api/login', (req,res)=>{
  const d=load(); const {login,password}=req.body||{};
  const u=d.users.find(x=>x.login===String(login||'').trim());
  if(!u || !bcrypt.compareSync(String(password||''), u.passwordHash)) return res.status(401).json({error:'Identifiant ou mot de passe incorrect'});
  req.session.userId=u.id; res.json({ok:true,user:safe(u)});
});
app.post('/api/logout', (req,res)=> req.session.destroy(()=>res.json({ok:true})) );
app.post('/api/password', needLogin, (req,res)=>{
  const d=load(); const u=d.users.find(x=>x.id===req.session.userId);
  if(!bcrypt.compareSync(String(req.body.oldPassword||''), u.passwordHash)) return res.status(400).json({error:'Ancien mot de passe incorrect'});
  if(!req.body.newPassword || String(req.body.newPassword).length<4) return res.status(400).json({error:'Nouveau mot de passe trop court'});
  u.passwordHash=bcrypt.hashSync(String(req.body.newPassword),10); audit(d,req,'Changement de mot de passe'); save(d); res.json({ok:true});
});
app.get('/api/data', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  res.json({user:safe(u), agents:d.agents, callsigns:d.callsigns, interventions:d.interventions, crews:d.crews, logs:d.logs.slice(0,100), note:d.notes[u.id]||'', users:u.role==='admin'?d.users.map(safe):undefined});
});
app.post('/api/note', needLogin, (req,res)=>{ const d=load(); d.notes[req.session.userId]=String(req.body.note||''); save(d); res.json({ok:true}); });
app.post('/api/agents', needLogin, needAdmin, (req,res)=>{ const d=load(); d.agents=Array.isArray(req.body.agents)?req.body.agents:d.agents; audit(d,req,'Mise à jour personnel'); save(d); res.json({ok:true}); });
app.post('/api/crew', needLogin, (req,res)=>{
  const d=load(); const c=req.body.crew||{}; if(!c.callsign) return res.status(400).json({error:'Indicatif obligatoire'});
  if(c.id){ const i=d.crews.findIndex(x=>x.id===c.id); if(i<0) return res.status(404).json({error:'Équipage introuvable'}); d.crews[i]={...d.crews[i], callsign:c.callsign, matricules:c.matricules||[], observations:c.observations||''}; audit(d,req,'Modification équipage '+c.callsign); }
  else { d.crews.push({id:Date.now().toString(), callsign:c.callsign, matricules:c.matricules||[], observations:c.observations||'', status:'DISPO', intervention:''}); audit(d,req,'Création équipage '+c.callsign); }
  save(d); res.json({ok:true});
});
app.delete('/api/crew/:id', needLogin, (req,res)=>{ const d=load(); const c=d.crews.find(x=>x.id===req.params.id); d.crews=d.crews.filter(x=>x.id!==req.params.id); if(c) audit(d,req,'Suppression équipage '+c.callsign); save(d); res.json({ok:true}); });
app.post('/api/crew/:id/status', needLogin, (req,res)=>{ const d=load(); const c=d.crews.find(x=>x.id===req.params.id); if(!c) return res.status(404).json({error:'Équipage introuvable'}); c.status=req.body.status==='INDISPO'?'INDISPO':'DISPO'; c.intervention=c.status==='INDISPO'?String(req.body.intervention||'Intervention'):''; audit(d,req,`${c.callsign} ${c.status}${c.intervention?' - '+c.intervention:''}`); save(d); res.json({ok:true}); });
app.post('/api/admin/users', needLogin, needAdmin, (req,res)=>{ const d=load(); const r=req.body||{}; if(!r.displayName||!r.login||!r.role) return res.status(400).json({error:'Nom, identifiant et rôle obligatoires'}); if(!['admin','superviseur','operateur'].includes(r.role)) return res.status(400).json({error:'Rôle invalide'}); if(r.id){ const u=d.users.find(x=>x.id===r.id); if(!u) return res.status(404).json({error:'Utilisateur introuvable'}); u.displayName=r.displayName; u.login=r.login; u.role=r.role; if(r.password) u.passwordHash=bcrypt.hashSync(String(r.password),10); } else { if(!r.password) return res.status(400).json({error:'Mot de passe obligatoire pour créer'}); if(d.users.some(u=>u.login===r.login)) return res.status(400).json({error:'Identifiant déjà utilisé'}); d.users.push({id:Date.now().toString(), displayName:r.displayName, login:r.login, role:r.role, passwordHash:bcrypt.hashSync(String(r.password),10)}); } audit(d,req,'Gestion utilisateur'); save(d); res.json({ok:true}); });
app.delete('/api/admin/users/:id', needLogin, needAdmin, (req,res)=>{ const d=load(); if(req.params.id===req.session.userId) return res.status(400).json({error:'Impossible de supprimer ton compte connecté'}); d.users=d.users.filter(u=>u.id!==req.params.id); audit(d,req,'Suppression utilisateur'); save(d); res.json({ok:true}); });
app.post('/api/admin/lists', needLogin, needAdmin, (req,res)=>{ const d=load(); d.callsigns=Array.isArray(req.body.callsigns)?req.body.callsigns:d.callsigns; d.interventions=Array.isArray(req.body.interventions)?req.body.interventions:d.interventions; audit(d,req,'Modification listes admin'); save(d); res.json({ok:true}); });

app.listen(PORT,()=>console.log('PEGASE V23 prêt sur le port '+PORT));
