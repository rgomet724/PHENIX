const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const MemoryStore = require('memorystore')(session);
const FileStore = require('session-file-store')(session);
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB = "/var/data/data.json";
const DB_BACKUP = "/var/data/data.backup.json";
const DB_BACKUP_2 = "/var/data/data.backup2.json";
const DB_BACKUP_3 = "/var/data/data.backup3.json";
const DB_TMP = "/var/data/data.tmp.json";
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
// Session persistante longue durée : plus de déconnexion quotidienne.
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 1 an
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;       // 1 an
const BCRYPT_ROUNDS = 12;
const PASSWORD_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours
const PASSWORD_POLICY_START = '2026-08-28T00:00:00.000Z';
const SOUND_KINDS = ['crew','urgent','system'];

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
    messages: [], // Anciennes données conservées mais la messagerie n'est plus exposée
    messageThreadDeletes: {},
    passwordResetRequests: [],
    notificationSounds: {},
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
  d.passwordResetRequests=Array.isArray(d.passwordResetRequests)?d.passwordResetRequests:[];
  d.notificationSounds=d.notificationSounds&&typeof d.notificationSounds==='object'?d.notificationSounds:{};
  // Migration de l'ancien son unique vers le son "équipage".
  if(d.notificationSound && !d.notificationSounds.crew) d.notificationSounds.crew=d.notificationSound;
  d.flash=d.flash||{enabled:false,title:'INFO',text:''};
  if(typeof d.flash.enabled!=='boolean') d.flash.enabled=false;
  d.flash.title=String(d.flash.title||'INFO').trim()||'INFO';
  d.flash.text=String(d.flash.text||'');
  d.users.forEach(u=>{
    if(!u.brigades) u.brigades={jour:true,nuit:true};
    // Les comptes existants repartent avec 90 jours à compter de cette mise à jour.
    if(!u.passwordChangedAt && !u.mustChangePassword) u.passwordChangedAt=PASSWORD_POLICY_START;
  });
  return d;
}

function readDataFile(file){
  try{
    if(!fs.existsSync(file)) return null;
    const raw=fs.readFileSync(file,'utf8');
    if(!raw.trim()) return null;
    return migrate(JSON.parse(raw));
  }catch(e){
    console.error('[PHENIX] Lecture impossible '+file+':',e.message);
    return null;
  }
}
function writeDataAtomic(d,{backup=true}={}){
  fs.mkdirSync(path.dirname(DB),{recursive:true});
  if(backup && fs.existsSync(DB)){
    try{
      const current=fs.readFileSync(DB,'utf8');
      JSON.parse(current);
      // Trois générations pour éviter qu'une mauvaise version écrase immédiatement la seule sauvegarde.
      if(fs.existsSync(DB_BACKUP_2)){ try{fs.copyFileSync(DB_BACKUP_2,DB_BACKUP_3)}catch(e){} }
      if(fs.existsSync(DB_BACKUP)){ try{fs.copyFileSync(DB_BACKUP,DB_BACKUP_2)}catch(e){} }
      fs.writeFileSync(DB_BACKUP,current);
    }catch(e){ console.error('[PHENIX] Backup ignoré :',e.message); }
  }
  fs.writeFileSync(DB_TMP,JSON.stringify(d,null,2));
  fs.renameSync(DB_TMP,DB);
}
function eventRecoveryCandidates(){
  const fixed=[
    DB_BACKUP, DB_BACKUP_2, DB_BACKUP_3,
    '/var/data/data.old.json','/var/data/data.previous.json','/var/data/data.json.bak','/var/data/backup.json'
  ];
  try{
    if(fs.existsSync('/var/data')){
      for(const name of fs.readdirSync('/var/data')){
        const full=path.join('/var/data',name);
        if(full===DB || fixed.includes(full)) continue;
        try{
          if(fs.statSync(full).isFile() && /\.json$/i.test(name)) fixed.push(full);
        }catch(e){}
      }
    }
  }catch(e){ console.error('[PHENIX] Recherche sauvegardes événements :',e.message); }
  return [...new Set(fixed)];
}
function recoverEventsFromKnownFiles(current){
  if(Array.isArray(current.events) && current.events.length) return current;
  let best=[]; let source='';
  for(const f of eventRecoveryCandidates()){
    const x=readDataFile(f);
    if(x && Array.isArray(x.events) && x.events.length>best.length){best=x.events;source=f}
  }
  if(best.length){
    current.events=best;
    writeDataAtomic(current,{backup:false});
    console.log('[PHENIX] '+best.length+' anciens événements restaurés depuis '+source);
  }
  return current;
}

function load(){
  let d=readDataFile(DB);
  const backup=readDataFile(DB_BACKUP);
  if(!d){
    if(backup){
      console.error('[PHENIX] data.json illisible : restauration depuis data.backup.json');
      writeDataAtomic(backup,{backup:false});
      return recoverEventsFromKnownFiles(backup);
    }
    if(fs.existsSync(DB)) throw new Error('data.json existe mais est illisible. Restauration manuelle nécessaire.');
    d=baseData();writeDataAtomic(d,{backup:false});return d;
  }
  return recoverEventsFromKnownFiles(d);
}

function save(d){ writeDataAtomic(d,{backup:true}); }
function passwordExpired(u){
  if(!u || normalizedRole(u.role)==='dashboard') return false;
  if(u.mustChangePassword) return true;
  const changed=u.passwordChangedAt?new Date(u.passwordChangedAt).getTime():0;
  return !changed || (Date.now()-changed)>=PASSWORD_MAX_AGE_MS;
}
function passwordExpiresAt(u){
  if(!u || normalizedRole(u.role)==='dashboard' || !u.passwordChangedAt) return null;
  return new Date(new Date(u.passwordChangedAt).getTime()+PASSWORD_MAX_AGE_MS).toISOString();
}
function safe(u){ return u ? {
  id:u.id, login:u.login, displayName:u.displayName, role:u.role,
  brigades:u.brigades||{jour:true,nuit:true},
  passwordChangeRequired:passwordExpired(u),
  passwordExpiresAt:passwordExpiresAt(u)
} : null; }
function current(req){ const d=load(); return d.users.find(u=>u.id===req.session.userId); }
function needLogin(req,res,next){
  if(!req.session || !req.session.userId) return res.status(401).json({error:'Session expirée ou non connecté'});
  const u=current(req);
  if(!u) return res.status(401).json({error:'Compte introuvable'});
  if(passwordExpired(u) && req.path!=='/api/password'){
    return res.status(428).json({error:'Votre mot de passe doit être changé avant de continuer.',code:'PASSWORD_CHANGE_REQUIRED'});
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
function auditType(msg){
  const s=String(msg||'').toLowerCase();
  if(s.includes('connexion')||s.includes('mot de passe')||s.includes('utilisateur')) return 'Sécurité / comptes';
  if(s.includes('équipage')||s.includes('dispo')||s.includes('indispo')) return 'Équipages';
  if(s.includes('consigne')) return 'Consignes';
  if(s.includes('événement')) return 'Événements';
  if(s.includes('lien')) return 'Liens utiles';
  if(s.includes('personnel')||s.includes('agent')) return 'Personnel';
  if(s.includes('flash')||s.includes('son')) return 'Administration';
  return 'Autre';
}
function requestIp(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || '';
}
function audit(d, req, msg, type){
  const u=current(req);
  const deviceId=String(req.get('x-phenix-device-id')||'').slice(0,80);
  const deviceName=String(req.get('x-phenix-device-name')||'').slice(0,100);
  d.logs.unshift({
    id:crypto.randomUUID(), date:new Date().toISOString(),
    userId:u?u.id:null, user:u?u.displayName:'Système',
    type:type||auditType(msg), msg,
    deviceId, deviceName:deviceName||deviceId||'Poste non identifié',
    ip:requestIp(req), userAgent:String(req.get('user-agent')||'').slice(0,300),
    method:req.method, route:req.originalUrl
  });
  d.logs=d.logs.slice(0,10000);
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

function notificationSoundMeta(d){
  const n=d.notificationSound||{};
  return {custom:!!n.custom,filename:String(n.filename||''),updatedAt:String(n.updatedAt||'')};
}

function trimMessages(d){
  d.messages=(d.messages||[]).slice(-3000);
}

function threadKey(scope,peerId){
  return 'private:'+String(peerId||'');
}
function threadDeletedAt(d,userId,key){
  const userMap=d.messageThreadDeletes&&d.messageThreadDeletes[userId];
  const v=userMap&&userMap[key];
  return v?new Date(v).getTime():0;
}
function messageAfterThreadDelete(d,u,m){
  const peerId=m.fromId===u.id?m.toId:m.fromId;
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

const sessionPath = IS_PROD ? '/var/data/sessions' : path.join(__dirname,'.sessions');
try{ fs.mkdirSync(sessionPath,{recursive:true}); }catch(e){}
const sessionStore = new FileStore({
  path: sessionPath,
  ttl: SESSION_TTL_SECONDS,
  retries: 1,
  reapInterval: 24*60*60
});
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
  const u={id:Date.now().toString(), displayName:String(displayName).trim().slice(0,120), login:cleanLogin, role:'admin', brigades:{jour:true,nuit:true}, passwordHash:bcrypt.hashSync(String(password),BCRYPT_ROUNDS), passwordChangedAt:new Date().toISOString(), mustChangePassword:false};
  d.users.push(u); audit(d,req,'Création du premier admin'); save(d);
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:'Impossible de créer la session'});
    req.session.userId=u.id;
    req.session.csrfToken=newCsrfToken();
    req.session.save(()=>{
      const d2=load(); audit(d2,req,'Connexion'); save(d2);
      res.json({ok:true,user:safe(u),csrfToken:req.session.csrfToken});
    });
  });
});


const passwordResetLimiter=rateLimit({
  windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false,
  message:{error:'Trop de demandes. Réessayez dans quelques minutes.'}
});
app.post('/api/password-reset/request', passwordResetLimiter, (req,res)=>{
  const d=load(); const login=normalizeLogin(req.body&&req.body.login);
  const u=d.users.find(x=>String(x.login||'')===login && normalizedRole(x.role)!=='dashboard');
  if(u){
    const recent=(d.passwordResetRequests||[]).find(x=>x.userId===u.id&&x.status==='pending'&&(Date.now()-new Date(x.createdAt).getTime())<60*60*1000);
    if(!recent){
      const r={id:crypto.randomUUID(),userId:u.id,login:u.login,displayName:u.displayName,status:'pending',createdAt:new Date().toISOString(),requestIp:requestIp(req),deviceName:String(req.get('x-phenix-device-name')||'').slice(0,100),deviceId:String(req.get('x-phenix-device-id')||'').slice(0,80)};
      d.passwordResetRequests.unshift(r); d.passwordResetRequests=d.passwordResetRequests.slice(0,500);
      audit(d,req,'Demande de mot de passe oublié pour '+u.login,'Sécurité / comptes'); save(d);
      pushRealtimeEvent(d.users.filter(x=>x.role==='admin').map(x=>x.id),{type:'password-reset-request',id:r.id,displayName:r.displayName,createdAt:r.createdAt});
    }
  }
  // Réponse volontairement générique pour ne pas révéler les identifiants existants.
  res.json({ok:true,message:'Si cet identifiant existe, la demande a été transmise à un administrateur PHENIX.'});
});
app.post('/api/admin/password-resets/:id/complete', needLogin, needAdmin, (req,res)=>{
  const d=load(); const r=(d.passwordResetRequests||[]).find(x=>x.id===req.params.id&&x.status==='pending');
  if(!r) return res.status(404).json({error:'Demande introuvable'});
  const u=d.users.find(x=>x.id===r.userId); if(!u) return res.status(404).json({error:'Utilisateur introuvable'});
  const pwd=String(req.body&&req.body.temporaryPassword||''); if(!validPassword(pwd)) return res.status(400).json({error:'Mot de passe temporaire requis : 12 à 72 caractères'});
  u.passwordHash=bcrypt.hashSync(pwd,BCRYPT_ROUNDS); u.mustChangePassword=true; u.passwordChangedAt=null;
  r.status='completed'; r.completedAt=new Date().toISOString(); r.completedBy=current(req).id;
  audit(d,req,'Réinitialisation temporaire du mot de passe de '+u.login,'Sécurité / comptes'); save(d);
  res.json({ok:true});
});
app.post('/api/admin/password-resets/:id/dismiss', needLogin, needAdmin, (req,res)=>{
  const d=load(); const r=(d.passwordResetRequests||[]).find(x=>x.id===req.params.id&&x.status==='pending');
  if(!r) return res.status(404).json({error:'Demande introuvable'});
  r.status='dismissed'; r.completedAt=new Date().toISOString(); r.completedBy=current(req).id;
  audit(d,req,'Classement d’une demande de mot de passe oublié','Sécurité / comptes'); save(d); res.json({ok:true});
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
  u.passwordChangedAt=new Date().toISOString();
  u.mustChangePassword=false;
  audit(d,req,'Changement de mot de passe','Sécurité / comptes'); save(d);
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:'Mot de passe modifié, mais reconnexion nécessaire'});
    req.session.userId=u.id; req.session.csrfToken=newCsrfToken();
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
    users:['admin','superviseur'].includes(u.role)?d.users.map(safe):undefined,
    adminPasswordResets:u.role==='admin'?(d.passwordResetRequests||[]).filter(x=>x.status==='pending').slice(0,50):undefined,
    adminAlerts:u.role==='admin'?{passwordResetPending:(d.passwordResetRequests||[]).filter(x=>x.status==='pending').length}:undefined
  });
});





// Messagerie temps réel
const realtimeStreams = new Map();

function addRealtimeStream(userId,res){
  if(!realtimeStreams.has(userId)) realtimeStreams.set(userId,new Set());
  realtimeStreams.get(userId).add(res);
}
function removeRealtimeStream(userId,res){
  const set=realtimeStreams.get(userId);
  if(!set) return;
  set.delete(res);
  if(!set.size) realtimeStreams.delete(userId);
}
function pushRealtimeEvent(userIds,payload){
  const data='data: '+JSON.stringify(payload)+'\n\n';
  for(const uid of new Set((userIds||[]).filter(Boolean))){
    const set=realtimeStreams.get(uid);
    if(!set) continue;
    for(const res of [...set]){
      try{res.write(data)}catch(e){removeRealtimeStream(uid,res)}
    }
  }
}


app.get('/api/realtime/stream', needLogin, (req,res)=>{
  const u=current(req);
  if(!u) return res.status(401).end();

  res.status(200);
  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache, no-transform',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no'
  });
  if(res.flushHeaders) res.flushHeaders();

  addRealtimeStream(u.id,res);
  res.write('event: ready\ndata: {"ok":true}\n\n');

  const heartbeat=setInterval(()=>{
    try{res.write(': ping\n\n')}catch(e){}
  },25000);

  req.on('close',()=>{
    clearInterval(heartbeat);
    removeRealtimeStream(u.id,res);
  });
});

// La messagerie privée a été retirée de PHENIX. Les anciennes données ne sont pas exposées.


function soundMeta(d,kind){
  const n=(d.notificationSounds||{})[kind]||{};
  return {kind,custom:!!n.custom,filename:String(n.filename||''),updatedAt:String(n.updatedAt||'')};
}
function soundPath(d,kind){
  const n=(d.notificationSounds||{})[kind]||{};
  if(n.custom && n.path && fs.existsSync(n.path)) return n.path;
  return path.join(__dirname,'public','alerte.wav');
}
app.get('/api/sounds/:kind', needLogin, (req,res)=>{
  const kind=String(req.params.kind||'');
  if(!SOUND_KINDS.includes(kind)) return res.status(404).end();
  const d=load(); const p=soundPath(d,kind);
  if(!fs.existsSync(p)) return res.status(404).end();
  const ext=path.extname(p).toLowerCase();
  res.set('Cache-Control','no-store');
  return res.type(ext==='.mp3'?'audio/mpeg':'audio/wav').sendFile(path.resolve(p));
});
app.get('/api/sounds/meta', needLogin, (req,res)=>{
  const d=load();
  res.set('Cache-Control','no-store');
  res.json({sounds:SOUND_KINDS.map(k=>soundMeta(d,k)),serverTime:Date.now()});
});

app.get('/api/realtime/snapshot', needLogin, (req,res)=>{
  const d=load();
  res.set('Cache-Control','no-store');
  res.json({
    serverTime:Date.now(),
    crews:(d.crews||[]).map(c=>({id:c.id,status:c.status,callsign:c.callsign,intervention:c.intervention||''})),
    sounds:SOUND_KINDS.map(k=>soundMeta(d,k))
  });
});

app.get('/api/admin/sounds', needLogin, needAdmin, (req,res)=>{
  const d=load(); res.json({sounds:SOUND_KINDS.map(k=>soundMeta(d,k))});
});
app.post('/api/admin/sounds/:kind', needLogin, needAdmin, express.json({limit:'12mb'}), (req,res)=>{
  const kind=String(req.params.kind||'');
  if(!SOUND_KINDS.includes(kind)) return res.status(400).json({error:'Type de son invalide'});
  const d=load(); const filename=String(req.body&&req.body.filename||'').trim();
  const dataUrl=String(req.body&&req.body.data||''); const ext=path.extname(filename).toLowerCase();
  if(!['.mp3','.wav','.wave'].includes(ext)) return res.status(400).json({error:'Format accepté : MP3 ou WAV'});
  const m=dataUrl.match(/^data:audio\/[^;]+;base64,(.+)$/);
  if(!m) return res.status(400).json({error:'Fichier audio invalide'});
  let buf; try{buf=Buffer.from(m[1],'base64')}catch(e){return res.status(400).json({error:'Fichier audio invalide'})}
  if(!buf.length || buf.length>8*1024*1024) return res.status(400).json({error:'Le fichier doit faire moins de 8 Mo'});
  const dir=IS_PROD?'/var/data':path.join(__dirname,'.data'); fs.mkdirSync(dir,{recursive:true});
  const realExt=ext==='.mp3'?'.mp3':'.wav'; const dest=path.join(dir,'phenix-sound-'+kind+realExt);
  for(const oldExt of ['.mp3','.wav']){ const old=path.join(dir,'phenix-sound-'+kind+oldExt); if(old!==dest&&fs.existsSync(old)){try{fs.unlinkSync(old)}catch(e){}} }
  fs.writeFileSync(dest,buf); d.notificationSounds=d.notificationSounds||{};
  d.notificationSounds[kind]={custom:true,filename:filename.slice(0,180),path:dest,updatedAt:new Date().toISOString()};
  audit(d,req,'Modification du son '+kind,'Administration'); save(d);
  pushRealtimeEvent(d.users.map(x=>x.id),{type:'sound-config',kind,updatedAt:d.notificationSounds[kind].updatedAt});
  res.json({ok:true,...soundMeta(d,kind)});
});
app.delete('/api/admin/sounds/:kind', needLogin, needAdmin, (req,res)=>{
  const kind=String(req.params.kind||''); if(!SOUND_KINDS.includes(kind)) return res.status(400).json({error:'Type de son invalide'});
  const d=load(); const n=(d.notificationSounds||{})[kind]||{};
  if(n.path&&fs.existsSync(n.path)){try{fs.unlinkSync(n.path)}catch(e){}}
  d.notificationSounds=d.notificationSounds||{}; d.notificationSounds[kind]={custom:false,filename:'',path:'',updatedAt:new Date().toISOString()};
  audit(d,req,'Restauration du son '+kind,'Administration'); save(d);
  pushRealtimeEvent(d.users.map(x=>x.id),{type:'sound-config',kind,updatedAt:d.notificationSounds[kind].updatedAt});
  res.json({ok:true,...soundMeta(d,kind)});
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
  pushRealtimeEvent(d.users.map(x=>x.id),{
    type:'crew-status',
    crewId:c.id,
    callsign:c.callsign,
    status:c.status,
    intervention:c.intervention||'',
    changedAt:new Date().toISOString()
  });
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
  const currentConsigne=r.id?d.consignes.find(x=>x.id===r.id):d.consignes[0];
  if(currentConsigne && currentConsigne.priority==='urgent'){
    const recipients=d.users.filter(x=>visibleConsigne(currentConsigne,x)).map(x=>x.id);
    pushRealtimeEvent(recipients,{type:'urgent-consigne',id:currentConsigne.id,title:currentConsigne.title,updatedAt:new Date().toISOString()});
  }
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
  if(d.flash.enabled && d.flash.text) pushRealtimeEvent(d.users.map(x=>x.id),{type:'system-alert',title:d.flash.title,text:d.flash.text,updatedAt:new Date().toISOString()});
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


app.get('/api/history', needLogin, (req,res)=>{
  const d=load(); const u=current(req);
  if(!u || !['admin','superviseur'].includes(u.role)) return res.status(403).json({error:'Réservé superviseur/admin'});
  let arr=(d.logs||[]).slice();
  const userId=String(req.query.userId||''); const type=String(req.query.type||''); const search=String(req.query.search||'').trim().toLowerCase();
  const from=req.query.from?new Date(String(req.query.from)+'T00:00:00').getTime():0;
  const to=req.query.to?new Date(String(req.query.to)+'T23:59:59.999').getTime():Date.now();
  arr=arr.filter(l=>{
    const t=new Date(l.date).getTime();
    if(!Number.isFinite(t)||t<from||t>to) return false;
    if(userId&&l.userId!==userId) return false;
    if(type&&String(l.type||'Autre')!==type) return false;
    if(search&&!([l.user,l.msg,l.deviceName,l.ip,l.route].join(' ').toLowerCase().includes(search))) return false;
    return true;
  }).slice(0,1000);
  const types=[...new Set((d.logs||[]).map(l=>String(l.type||'Autre')))].sort();
  res.json({logs:arr,types});
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


app.get('/api/events/recovery-status', needLogin, (req,res)=>{
  const u=current(req);
  if(!u || !['admin','superviseur'].includes(normalizedRole(u.role))) return res.status(403).json({error:'Réservé superviseur/admin'});
  const files=[DB,...eventRecoveryCandidates()];
  res.json({sources:[...new Set(files)].map(file=>{const d=readDataFile(file);return {file,exists:fs.existsSync(file),events:d&&Array.isArray(d.events)?d.events.length:0}})});
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
    if(r.password){ if(!validPassword(r.password)) return res.status(400).json({error:'Mot de passe requis : 12 à 72 caractères'}); u.passwordHash=bcrypt.hashSync(String(r.password),BCRYPT_ROUNDS); u.mustChangePassword=true; u.passwordChangedAt=null; }
  } else {
    if(!r.password) return res.status(400).json({error:'Mot de passe obligatoire pour créer'});
    if(!validPassword(r.password)) return res.status(400).json({error:'Mot de passe requis : 12 à 72 caractères'});
    if(d.users.some(u=>u.id!==r.id && String(u.login||'').toLowerCase()===r.login.toLowerCase())) return res.status(400).json({error:'Identifiant déjà utilisé'});
    d.users.push({id:Date.now().toString(), displayName:r.displayName, login:r.login, role:r.role, brigades, passwordHash:bcrypt.hashSync(String(r.password),BCRYPT_ROUNDS), mustChangePassword:r.role!=='dashboard', passwordChangedAt:r.role==='dashboard'?new Date().toISOString():null});
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
  if(Array.isArray(req.body.callsigns)){
    d.callsigns=[...new Set(req.body.callsigns.map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))].slice(0,250);
  }
  if(Array.isArray(req.body.interventions)){
    d.interventions=[...new Set(req.body.interventions.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,500);
  }
  audit(d,req,'Modification listes admin');
  save(d);
  res.json({ok:true,callsigns:d.callsigns,interventions:d.interventions});
});

app.use((err,req,res,next)=>{
  console.error('[PHENIX]',err && err.stack ? err.stack : err);
  if(res.headersSent) return next(err);
  res.status(500).json({error:'Erreur interne du serveur'});
});

app.listen(PORT,'0.0.0.0',()=>console.log('PHENIX sécurisé prêt sur le port '+PORT));
