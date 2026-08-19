const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const MemoryStore = require('memorystore')(session);
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB = "/var/data/data.json";
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const SESSION_MAX_AGE_MS = 60 * 60 * 1000;       // 1 h d'inactivité
const SESSION_ABSOLUTE_MAX_MS = 8 * 60 * 60 * 1000; // 8 h maximum
const BCRYPT_ROUNDS = 12;

const SESSION_SECRET = String(process.env.SESSION_SECRET || '');
if (IS_PROD && Buffer.byteLength(SESSION_SECRET, 'utf8') < 32) {
  throw new Error('SESSION_SECRET manquant ou trop court. Configure une valeur aléatoire d’au moins 32 octets dans Render.');
}
const EFFECTIVE_SESSION_SECRET = SESSION_SECRET || crypto.randomBytes(48).toString('base64');

function normalizeLogin(v){ return String(v||'').trim().slice(0,80); }
function validPassword(v){
  const s=String(v||'');
  return s.length >= 12 && s.length <= 72 && Buffer.byteLength(s,'utf8') <= 72;
}
function newCsrfToken(){ return crypto.randomBytes(32).toString('hex'); }
function safeEqual(a,b){
  const aa=Buffer.from(String(a||'')), bb=Buffer.from(String(b||''));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}


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
    events: [],
    messages: [],
    messageThreadDeletes: {},
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
  d.events=d.events||[];
  d.messages=Array.isArray(d.messages)?d.messages:[];
  d.messageThreadDeletes=d.messageThreadDeletes&&typeof d.messageThreadDeletes==='object'?d.messageThreadDeletes:{};
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
function needLogin(req,res,next){
  if(!req.session || !req.session.userId) return res.status(401).json({error:'Session expirée ou non connecté'});
  const loginAt=Number(req.session.loginAt||0);
  if(!loginAt || Date.now()-loginAt > SESSION_ABSOLUTE_MAX_MS){
    return req.session.destroy(()=>res.status(401).json({error:'Session expirée, reconnecte-toi'}));
  }
  next();
}
function needAdmin(req,res,next){ const u=current(req); if(!u || u.role!=='admin') return res.status(403).json({error:'Réservé admin'}); next(); }
function normalizedRole(role){
  const r=String(role||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(r==='administrateur') return 'admin';
  if(r==='operateur') return 'operateur';
  return r;
}
function needOperational(req,res,next){
  const u=current(req);
  if(!u || normalizedRole(u.role)==='dashboard') return res.status(403).json({error:'Accès lecture seule'});
  next();
}
function needConsigneManager(req,res,next){ const u=current(req); if(!u || !['admin','superviseur'].includes(u.role)) return res.status(403).json({error:'Réservé superviseur/admin'}); next(); }
function audit(d, req, msg){ const u=current(req); d.logs.unshift({date:new Date().toISOString(), userId:u?u.id:null, user:u?u.displayName:'Système', msg}); d.logs=d.logs.slice(0,2000); }

function canUseMessaging(u){ return !!u && normalizedRole(u.role)!=='dashboard'; }
function messageUser(u){ return u ? {id:u.id, displayName:u.displayName} : null; }
function messageVisibleTo(m,userId){
  return m.scope==='general' || m.fromId===userId || m.toId===userId;
}
function messageUnreadFor(m,userId){
  return m.fromId!==userId && messageVisibleTo(m,userId) && !(Array.isArray(m.readBy)&&m.readBy.includes(userId));
}
function messageSummary(d,u){
  if(!canUseMessaging(u)) return {enabled:false,unread:0,lastMessageId:null};
  const visible=(d.messages||[]).filter(m=>messageVisibleTo(m,u.id)&&messageAfterThreadDelete(d,u,m));
  const unread=visible.filter(m=>messageUnreadFor(m,u.id)).length;
  return {
    enabled:true,
    unread,
    lastMessageId:visible.length?visible[visible.length-1].id:null
  };
}
function trimMessages(d){
  d.messages=(d.messages||[]).slice(-3000);
}

function threadKey(scope,peerId){
  return scope==='general'?'general':'private:'+String(peerId||'');
}
function threadDeletedAt(d,userId,key){
  const userMap=d.messageThreadDeletes&&d.messageThreadDeletes[userId];
  const v=userMap&&userMap[key];
  return v?new Date(v).getTime():0;
}
function messageAfterThreadDelete(d,u,m){
  const peerId=m.scope==='private'?(m.fromId===u.id?m.toId:m.fromId):'';
  const cut=threadDeletedAt(d,u.id,threadKey(m.scope,peerId));
  return !cut || new Date(m.createdAt).getTime()>cut;
}


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


app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'","'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'","'unsafe-inline'"],
      imgSrc: ["'self'","data:","blob:"],
      fontSrc: ["'self'","data:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: IS_PROD ? {maxAge:31536000, includeSubDomains:true} : false,
  referrerPolicy: {policy:'no-referrer'}
}));

app.use(express.json({limit:'4mb', strict:true}));

const sessionStore = new MemoryStore({ checkPeriod: 24*60*60*1000 });
app.use(session({
  name: 'phenix.sid',
  store: sessionStore,
  secret: EFFECTIVE_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  unset: 'destroy',
  proxy: IS_PROD,
  cookie: {
    path:'/',
    httpOnly:true,
    secure:IS_PROD,
    sameSite:'strict',
    maxAge:SESSION_MAX_AGE_MS,
    priority:'high'
  }
}));

// Refuse les requêtes API mutantes venant d'une autre origine.
app.use('/api', (req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin=req.get('origin');
  if(origin){
    try{
      if(new URL(origin).host !== req.get('host')) return res.status(403).json({error:'Origine refusée'});
    }catch(e){ return res.status(403).json({error:'Origine refusée'}); }
  }
  next();
});

const apiLimiter = rateLimit({
  windowMs:5*60*1000,
  limit:500,
  standardHeaders:'draft-8',
  legacyHeaders:false,
  message:{error:'Trop de requêtes. Réessaie dans quelques minutes.'}
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs:15*60*1000,
  limit:8,
  standardHeaders:'draft-8',
  legacyHeaders:false,
  skipSuccessfulRequests:true,
  keyGenerator:req => `${ipKeyGenerator(req.ip)}:${normalizeLogin(req.body && req.body.login).toLowerCase()}`,
  message:{error:'Trop de tentatives de connexion. Réessaie dans 15 minutes.'}
});

// CSRF : obligatoire pour toutes les actions authentifiées.
app.use('/api', (req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if(['/api/login','/api/setup'].includes(req.path)) return next();
  if(!req.session || !req.session.userId) return next();
  if(!req.session.csrfToken || !safeEqual(req.get('x-csrf-token'), req.session.csrfToken)){
    return res.status(403).json({error:'Jeton de sécurité invalide. Recharge la page et reconnecte-toi.'});
  }
  next();
});

app.use('/api', (req,res,next)=>{
  res.set('Cache-Control','no-store, max-age=0');
  res.set('Pragma','no-cache');
  next();
});

app.use(express.static(path.join(__dirname,'public'), {
  etag:true,
  maxAge:0,
  setHeaders(res,filePath){
    if(filePath.endsWith('.html')) res.setHeader('Cache-Control','no-store');
  }
}));

app.get('/api/status', (req,res)=>{
  const d=load();
  res.json({
    setupRequired:d.users.length===0,
    user:safe(current(req)),
    csrfToken:req.session&&req.session.userId?req.session.csrfToken:null,
    flash:d.flash||{enabled:false,title:'INFO',text:''}
  });
});

app.post('/api/setup', authLimiter, (req,res)=>{
  const d=load();
  if(d.users.length>0) return res.status(403).json({error:'Le premier compte admin existe déjà'});
  const {displayName,login,password}=req.body||{};
  if(!displayName || !login || !password) return res.status(400).json({error:'Nom, identifiant et mot de passe obligatoires'});
  if(!validPassword(password)) return res.status(400).json({error:'Mot de passe requis : 12 à 72 caractères'});
  const cleanLogin=normalizeLogin(login);
  const u={id:Date.now().toString(), displayName:String(displayName).trim().slice(0,120), login:cleanLogin, role:'admin', brigades:{jour:true,nuit:true}, passwordHash:bcrypt.hashSync(String(password),BCRYPT_ROUNDS)};
  d.users.push(u); audit(d,req,'Création du premier admin'); save(d);
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:'Impossible de créer la session'});
    req.session.userId=u.id;
    req.session.loginAt=Date.now();
    req.session.csrfToken=newCsrfToken();
    req.session.save(()=>{
      const d2=load(); audit(d2,req,'Connexion'); save(d2);
      res.json({ok:true,user:safe(u),csrfToken:req.session.csrfToken});
    });
  });
});

app.post('/api/login', authLimiter, (req,res)=>{
  const d=load();
  const login=normalizeLogin(req.body&&req.body.login);
  const password=String(req.body&&req.body.password||'');
  if(!login || !password || login.length>80 || password.length>100){
    return res.status(401).json({error:'Identifiant ou mot de passe incorrect'});
  }
  const u=d.users.find(x=>String(x.login||'')===login);
  if(!u || !bcrypt.compareSync(password, u.passwordHash)){
    // Petit délai uniforme pour rendre le brute-force moins rentable.
    return setTimeout(()=>res.status(401).json({error:'Identifiant ou mot de passe incorrect'}), 300);
  }
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:'Impossible de créer la session'});
    req.session.userId=u.id;
    req.session.loginAt=Date.now();
    req.session.csrfToken=newCsrfToken();
    req.session.save(err2=>{
      if(err2) return res.status(500).json({error:'Impossible d’enregistrer la session'});
      const d2=load(); audit(d2,req,'Connexion'); save(d2);
      res.json({ok:true,user:safe(u),csrfToken:req.session.csrfToken});
    });
  });
});

app.post('/api/logout', (req,res)=>{
  const d=load(); audit(d,req,'Déconnexion'); save(d);
  req.session.destroy(()=>{
    res.clearCookie('phenix.sid',{path:'/',httpOnly:true,secure:IS_PROD,sameSite:'strict'});
    res.json({ok:true});
  });
});

app.post('/api/password', needLogin, (req,res)=>{
  const d=load(); const u=d.users.find(x=>x.id===req.session.userId);
  if(!bcrypt.compareSync(String(req.body.oldPassword||''), u.passwordHash)) return res.status(400).json({error:'Ancien mot de passe incorrect'});
  if(!validPassword(req.body.newPassword)) return res.status(400).json({error:'Nouveau mot de passe requis : 12 à 72 caractères'});
  if(String(req.body.oldPassword||'')===String(req.body.newPassword||'')) return res.status(400).json({error:'Le nouveau mot de passe doit être différent'});
  u.passwordHash=bcrypt.hashSync(String(req.body.newPassword),BCRYPT_ROUNDS);
  audit(d,req,'Changement de mot de passe'); save(d);
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:'Mot de passe modifié, mais reconnexion nécessaire'});
    req.session.userId=u.id; req.session.loginAt=Date.now(); req.session.csrfToken=newCsrfToken();
    req.session.save(()=>res.json({ok:true,csrfToken:req.session.csrfToken}));
  });
});

app.get('/api/data', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  res.json({
    user:safe(u),
    csrfToken:req.session.csrfToken,
    agents:d.agents,
    callsigns:d.callsigns,
    interventions:d.interventions,
    crews:d.crews,
    logs:d.logs.slice(0,100),
    note:d.notes[u.id]||'',
    consignes:consignesForUser(d,u),
    links:linksForUser(d,u),
    events:d.events||[],
    flash:d.flash||{enabled:false,title:'INFO',text:''},
    messaging:messageSummary(d,u),
    messageUsers:canUseMessaging(u)?d.users.filter(x=>normalizedRole(x.role)!=='dashboard'&&x.id!==u.id).map(messageUser):[],
    users:['admin','superviseur'].includes(u.role)?d.users.map(safe):undefined
  });
});




app.get('/api/messages/users', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!canUseMessaging(u)) return res.status(403).json({error:'Messagerie indisponible pour ce compte'});
  const users=d.users
    .filter(x=>x.id!==u.id && canUseMessaging(x))
    .map(messageUser)
    .sort((a,b)=>String(a.displayName||'').localeCompare(String(b.displayName||''),'fr',{sensitivity:'base'}));
  res.json({users});
});

app.get('/api/messages/threads', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!canUseMessaging(u)) return res.status(403).json({error:'Messagerie indisponible pour ce compte'});
  const visible=(d.messages||[]).filter(m=>messageVisibleTo(m,u.id));
  const usersById=Object.fromEntries(d.users.map(x=>[x.id,messageUser(x)]));
  const threads=[];

  const general=visible.filter(m=>m.scope==='general');
  const glast=general.length?general[general.length-1]:null;
  threads.push({
    key:'general',scope:'general',peerId:null,title:'Discussion générale',
    unread:general.filter(m=>messageUnreadFor(m,u.id)).length,
    lastMessage:glast?{id:glast.id,text:glast.text,createdAt:glast.createdAt,fromId:glast.fromId,from:usersById[glast.fromId]||{id:glast.fromId,displayName:'Utilisateur'}}:null
  });

  const privateMap=new Map();
  for(const m of visible){
    if(m.scope!=='private') continue;
    const peerId=m.fromId===u.id?m.toId:m.fromId;
    if(!peerId) continue;
    if(!privateMap.has(peerId)) privateMap.set(peerId,[]);
    privateMap.get(peerId).push(m);
  }
  for(const [peerId,arr] of privateMap){
    const last=arr[arr.length-1];
    const peer=usersById[peerId]||{id:peerId,displayName:'Utilisateur'};
    threads.push({
      key:'private:'+peerId,scope:'private',peerId,title:peer.displayName,
      unread:arr.filter(m=>messageUnreadFor(m,u.id)).length,
      lastMessage:{id:last.id,text:last.text,createdAt:last.createdAt,fromId:last.fromId,from:usersById[last.fromId]||{id:last.fromId,displayName:'Utilisateur'}}
    });
  }
  threads.sort((a,b)=>{
    const da=a.lastMessage?new Date(a.lastMessage.createdAt).getTime():0;
    const db=b.lastMessage?new Date(b.lastMessage.createdAt).getTime():0;
    return db-da;
  });
  res.json({threads});
});

app.get('/api/messages', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!canUseMessaging(u)) return res.status(403).json({error:'Messagerie indisponible pour ce compte'});
  const scope=req.query.scope==='private'?'private':'general';
  const peerId=String(req.query.peerId||'');
  let arr=(d.messages||[]).filter(m=>{
    const relevant=scope==='general'
      ? m.scope==='general'
      : m.scope==='private' && ((m.fromId===u.id&&m.toId===peerId)||(m.fromId===peerId&&m.toId===u.id));
    return relevant && messageAfterThreadDelete(d,u,m);
  });
  arr=arr.slice(-250);
  const usersById=Object.fromEntries(d.users.map(x=>[x.id,messageUser(x)]));
  res.json({
    messages:arr.map(m=>({
      id:m.id,scope:m.scope,fromId:m.fromId,toId:m.toId||null,text:m.text,createdAt:m.createdAt,
      from:usersById[m.fromId]||{id:m.fromId,displayName:'Utilisateur'}
    }))
  });
});

app.post('/api/messages', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!canUseMessaging(u)) return res.status(403).json({error:'Messagerie indisponible pour ce compte'});
  const scope=req.body&&req.body.scope==='private'?'private':'general';
  const text=String(req.body&&req.body.text||'').trim();
  if(!text) return res.status(400).json({error:'Message vide'});
  if(text.length>2000) return res.status(400).json({error:'Message trop long (2000 caractères maximum)'});
  let toId=null;
  if(scope==='private'){
    toId=String(req.body&&req.body.toId||'');
    const peer=d.users.find(x=>x.id===toId);
    if(!peer || !canUseMessaging(peer) || peer.id===u.id) return res.status(400).json({error:'Destinataire invalide'});
  }
  const m={
    id:crypto.randomUUID?crypto.randomUUID():crypto.randomBytes(16).toString('hex'),
    scope,fromId:u.id,toId,text,
    createdAt:new Date().toISOString(),
    readBy:[u.id]
  };
  d.messages.push(m); trimMessages(d); save(d);
  res.json({ok:true,id:m.id,createdAt:m.createdAt});
});


app.post('/api/messages/thread/delete', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!canUseMessaging(u)) return res.status(403).json({error:'Messagerie indisponible pour ce compte'});
  const scope=req.body&&req.body.scope==='private'?'private':'general';
  const peerId=scope==='private'?String(req.body&&req.body.peerId||''):'';
  if(scope==='private'){
    const peer=d.users.find(x=>x.id===peerId);
    if(!peer || !canUseMessaging(peer)) return res.status(400).json({error:'Discussion invalide'});
  }
  d.messageThreadDeletes=d.messageThreadDeletes||{};
  d.messageThreadDeletes[u.id]=d.messageThreadDeletes[u.id]||{};
  d.messageThreadDeletes[u.id][threadKey(scope,peerId)]=new Date().toISOString();
  save(d);
  res.json({ok:true});
});

app.post('/api/messages/read', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!canUseMessaging(u)) return res.status(403).json({error:'Messagerie indisponible pour ce compte'});
  const scope=req.body&&req.body.scope==='private'?'private':'general';
  const peerId=String(req.body&&req.body.peerId||'');
  let changed=false;
  for(const m of d.messages||[]){
    const relevant=scope==='general'
      ? m.scope==='general'
      : m.scope==='private'&&((m.fromId===u.id&&m.toId===peerId)||(m.fromId===peerId&&m.toId===u.id));
    if(relevant && m.fromId!==u.id){
      m.readBy=Array.isArray(m.readBy)?m.readBy:[];
      if(!m.readBy.includes(u.id)){m.readBy.push(u.id);changed=true;}
    }
  }
  if(changed) save(d);
  res.json({ok:true});
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
    d.crews[i]={...d.crews[i], callsign:c.callsign, matricules:c.matricules||[], observations:c.observations||'', meal:c.meal||'', shiftStart:String(c.shiftStart||''), shiftEnd:String(c.shiftEnd||'')};
    audit(d,req,'Modification équipage '+c.callsign);
  } else {
    d.crews.push({id:Date.now().toString(), callsign:c.callsign, matricules:c.matricules||[], observations:c.observations||'', meal:c.meal||'', shiftStart:String(c.shiftStart||''), shiftEnd:String(c.shiftEnd||''), status:'DISPO', intervention:''});
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
  if(c.status==='INDISPO'){
    c.intervention=String(req.body.intervention||'Intervention');
    c.interventionCode=String(req.body.code||'').trim().toUpperCase();
    c.interventionSource=String(req.body.source||'nature');
    c.eventId=String(req.body.eventId||'');
  }else{
    c.intervention='';
    c.interventionCode='';
    c.interventionSource='';
    c.eventId='';
  }
  const codeTxt=c.interventionCode?' ['+c.interventionCode+']':'';
  audit(d,req,`${c.callsign} ${c.status}${codeTxt}${c.intervention?' - '+c.intervention:''}`);
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


app.post('/api/events', needLogin, needConsigneManager, (req,res)=>{
  const d=load(); const u=current(req); const r=req.body||{};
  const title=String(r.title||'').trim();
  const code=String(r.code||'').trim().toUpperCase();
  const start=String(r.start||'').trim();
  const end=String(r.end||'').trim();
  if(!title) return res.status(400).json({error:'Nom de l’événement obligatoire'});
  if(!start || !end) return res.status(400).json({error:'Début et fin obligatoires'});
  const sd=new Date(start), ed=new Date(end);
  if(isNaN(sd.getTime()) || isNaN(ed.getTime()) || ed<=sd) return res.status(400).json({error:'Dates invalides'});
  const data={title,code,start,end,description:String(r.description||'').trim(),color:['blue','red','green','orange','purple','gray'].includes(r.color)?r.color:'blue',updatedAt:new Date().toISOString(),updatedBy:u.displayName};
  if(r.id){
    const ev=(d.events||[]).find(x=>x.id===r.id);
    if(!ev) return res.status(404).json({error:'Événement introuvable'});
    Object.assign(ev,data);
    audit(d,req,'Modification événement '+title);
  }else{
    d.events=d.events||[];
    d.events.unshift({id:Date.now().toString(),createdAt:new Date().toISOString(),createdBy:u.displayName,...data});
    audit(d,req,'Création événement '+title);
  }
  save(d); res.json({ok:true});
});

app.delete('/api/events/:id', needLogin, needConsigneManager, (req,res)=>{
  const d=load();
  const ev=(d.events||[]).find(x=>x.id===req.params.id);
  d.events=(d.events||[]).filter(x=>x.id!==req.params.id);
  if(ev) audit(d,req,'Suppression événement '+ev.title);
  save(d); res.json({ok:true});
});

app.post('/api/admin/users', needLogin, needAdmin, (req,res)=>{
  const d=load(); const r=req.body||{};
  if(!r.displayName||!r.login||!r.role) return res.status(400).json({error:'Nom, identifiant et rôle obligatoires'});
  r.login=normalizeLogin(r.login);
  r.displayName=String(r.displayName).trim().slice(0,120);
  if(!['admin','superviseur','operateur','dashboard'].includes(r.role)) return res.status(400).json({error:'Rôle invalide'});

  const brigades={jour:!!(r.brigades&&r.brigades.jour), nuit:!!(r.brigades&&r.brigades.nuit)};
  if(['admin','superviseur'].includes(r.role)){ brigades.jour=true; brigades.nuit=true; }

  if(r.id){
    const u=d.users.find(x=>x.id===r.id);
    if(!u) return res.status(404).json({error:'Utilisateur introuvable'});
    if(d.users.some(x=>x.id!==u.id && String(x.login||'').toLowerCase()===r.login.toLowerCase())) return res.status(400).json({error:'Identifiant déjà utilisé'});
    u.displayName=r.displayName;
    u.login=r.login;
    u.role=r.role;
    u.brigades=brigades;
    if(r.password){ if(!validPassword(r.password)) return res.status(400).json({error:'Mot de passe requis : 12 à 72 caractères'}); u.passwordHash=bcrypt.hashSync(String(r.password),BCRYPT_ROUNDS); }
  } else {
    if(!r.password) return res.status(400).json({error:'Mot de passe obligatoire pour créer'});
    if(!validPassword(r.password)) return res.status(400).json({error:'Mot de passe requis : 12 à 72 caractères'});
    if(d.users.some(u=>u.id!==r.id && String(u.login||'').toLowerCase()===r.login.toLowerCase())) return res.status(400).json({error:'Identifiant déjà utilisé'});
    d.users.push({id:Date.now().toString(), displayName:r.displayName, login:r.login, role:r.role, brigades, passwordHash:bcrypt.hashSync(String(r.password),BCRYPT_ROUNDS)});
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
  d.interventions=Array.isArray(req.body.interventions)?req.body.interventions.map(x=>String(x||'').trim()).filter(Boolean):d.interventions;
  audit(d,req,'Modification listes admin');
  save(d);
  res.json({ok:true});
});

app.use((err,req,res,next)=>{
  console.error('[PHENIX]',err && err.stack ? err.stack : err);
  if(res.headersSent) return next(err);
  res.status(500).json({error:'Erreur interne du serveur'});
});

app.listen(PORT,()=>console.log('PHENIX sécurisé prêt sur le port '+PORT));
