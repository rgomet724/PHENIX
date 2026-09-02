const express=require('express');
const session=require('express-session');
const rateLimit=require('express-rate-limit');
const helmet=require('helmet');
const bcrypt=require('bcryptjs');
const multer=require('multer');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const os=require('os');

const app=express();
app.disable('x-powered-by');
const PROD=process.env.NODE_ENV==='production';
// Render termine le HTTPS devant l'application. Sans trust proxy, Express
// considère la requête comme HTTP et refuse d'émettre le cookie de session secure.
if(PROD) app.set('trust proxy',1);
const PORT=process.env.PORT||3000;
function writableDataDir(){
  const preferred=process.env.DATA_DIR || (PROD?'/var/data':path.join(__dirname,'data'));
  const candidates=[preferred];
  if(PROD) candidates.push(path.join(os.tmpdir(),'portail-pm-chalon'));
  for(const dir of candidates){
    try{
      fs.mkdirSync(dir,{recursive:true});
      const probe=path.join(dir,'.write-test-'+process.pid);
      fs.writeFileSync(probe,'ok');
      fs.unlinkSync(probe);
      if(dir!==preferred) console.warn('Stockage principal indisponible, utilisation du stockage temporaire :',dir);
      return dir;
    }catch(e){
      console.error('Stockage inutilisable :',dir,e.message);
    }
  }
  throw new Error('Aucun répertoire de stockage accessible');
}
const DATA_DIR=writableDataDir();
const DB=path.join(DATA_DIR,'portal.json');
const LOGO_DIR=path.join(DATA_DIR,'portal-logos');
fs.mkdirSync(LOGO_DIR,{recursive:true});

const configuredSecret=String(process.env.SESSION_SECRET||'');
const SECRET=configuredSecret.length>=32?configuredSecret:crypto.randomBytes(48).toString('hex');
if(PROD && configuredSecret.length<32){
  console.warn('SESSION_SECRET absent ou trop court : secret temporaire utilisé. Le service démarre, mais les sessions seront invalidées au redémarrage.');
}

function base(){
  return {
    users:[],
    categories:[
      {id:'cat-operationnel',name:'Opérationnel',order:10},
      {id:'cat-outils',name:'Outils et applications',order:20},
      {id:'cat-documentation',name:'Documentation',order:30}
    ],
    apps:[
      {id:'app-phenix',categoryId:'cat-operationnel',name:'PHENIX',description:'Plateforme opérationnelle',url:'https://VOTRE-LIEN-PHENIX.onrender.com',logo:'',order:10}
    ]
  };
}
function load(){
  let d=base();
  try{
    if(fs.existsSync(DB)){
      const raw=JSON.parse(fs.readFileSync(DB,'utf8'));
      d={...d,...raw};
      d.users=Array.isArray(raw.users)?raw.users:[];
      d.categories=Array.isArray(raw.categories)?raw.categories:d.categories;
      d.apps=Array.isArray(raw.apps)?raw.apps:d.apps;
    }
  }catch(e){console.error('Lecture DB',e)}
  return d;
}
function save(d){
  const tmp=DB+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(d,null,2));
  fs.renameSync(tmp,DB);
}
async function ensureAdmin(){
  const d=load();
  const login=String(process.env.PORTAL_ADMIN_LOGIN||'admin').trim();
  const pass=String(process.env.PORTAL_ADMIN_PASSWORD||'');

  if(pass.length===0){
    const hasAdmin=d.users.some(u=>u.role==='admin');
    const msg='PORTAL_ADMIN_PASSWORD doit être défini sur Render.';
    console.warn(msg+' Le service reste accessible afin de permettre le diagnostic.');
    return;
  }

  // Le compte administrateur piloté par Render reste synchronisé avec les
  // variables d'environnement. Cela permet de récupérer l'accès simplement
  // en changeant PORTAL_ADMIN_LOGIN / PORTAL_ADMIN_PASSWORD puis en redéployant.
  let admin=d.users.find(u=>String(u.login||'').toLowerCase()===login.toLowerCase());
  if(!admin) admin=d.users.find(u=>u.role==='admin');

  if(!admin){
    d.users.push({
      id:crypto.randomUUID(),
      login,
      name:'Administrateur',
      role:'admin',
      passwordHash:await bcrypt.hash(pass,12),
      createdAt:new Date().toISOString()
    });
    save(d);
    console.log('Compte administrateur initial créé.');
    return;
  }

  let changed=false;
  if(admin.login!==login){ admin.login=login; changed=true; }
  if(admin.role!=='admin'){ admin.role='admin'; changed=true; }
  if(!admin.name){ admin.name='Administrateur'; changed=true; }
  const passwordOk=admin.passwordHash && await bcrypt.compare(pass,admin.passwordHash);
  if(!passwordOk){ admin.passwordHash=await bcrypt.hash(pass,12); changed=true; }

  if(changed){
    save(d);
    console.log('Compte administrateur synchronisé avec les variables Render.');
  }else{
    console.log('Compte administrateur Render vérifié.');
  }
}

app.use(helmet({
  contentSecurityPolicy:{
    directives:{
      defaultSrc:["'self'"],
      imgSrc:["'self'","data:","blob:"],
      styleSrc:["'self'","'unsafe-inline'"],
      scriptSrc:["'self'","'unsafe-inline'"],
      connectSrc:["'self'"],
      frameAncestors:["'none'"]
    }
  }
}));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:false}));
app.use(session({
  name:'pm_portal_sid_v2',
  secret:SECRET,
  proxy:PROD,
  resave:false,
  saveUninitialized:false,
  rolling:true,
  cookie:{httpOnly:true,secure:PROD,sameSite:'lax',maxAge:1000*60*60*12}
}));
app.use('/assets',express.static(LOGO_DIR,{maxAge:'1h'}));
app.use(express.static(path.join(__dirname,'public'),{maxAge:'5m'}));

const loginLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false});
const needLogin=(req,res,next)=>req.session.user?next():res.status(401).json({error:'AUTH_REQUIRED'});
const needAdmin=(req,res,next)=>req.session.user?.role==='admin'?next():res.status(403).json({error:'ADMIN_REQUIRED'});

app.get('/healthz',(req,res)=>res.json({
  ok:true,
  service:'portail-pm-chalon',
  adminConfigured:String(process.env.PORTAL_ADMIN_PASSWORD||'').length>0,
  sessionSecretConfigured:configuredSecret.length>=32,
  dataDir:DATA_DIR,
  persistentData:Boolean(process.env.DATA_DIR)
}));

app.get('/api/me',(req,res)=>res.json({user:req.session.user||null}));

function sameSecret(a,b){
  const ah=crypto.createHash('sha256').update(String(a)).digest();
  const bh=crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah,bh);
}

app.post('/api/login',loginLimiter,async(req,res)=>{
  const loginRaw=String(req.body.login||'').trim();
  const login=loginRaw.toLowerCase();
  const password=String(req.body.password||'');
  const adminLogin=String(process.env.PORTAL_ADMIN_LOGIN||'admin').trim();
  const adminPass=String(process.env.PORTAL_ADMIN_PASSWORD||'');

  let user=null;

  // Le compte administrateur Render est authentifié directement avec les
  // variables d'environnement. Le login ne dépend donc plus d'un ancien hash
  // présent dans portal.json après un redéploiement ou un changement de mot de passe.
  if(adminPass.length>0 && login===adminLogin.toLowerCase()){
    if(!sameSecret(password,adminPass)){
      console.warn('Échec connexion admin pour :',loginRaw||'(vide)');
      return res.status(401).json({error:'Identifiants incorrects'});
    }

    let d=load();
    let admin=d.users.find(x=>String(x.login||'').toLowerCase()===adminLogin.toLowerCase())
      || d.users.find(x=>x.role==='admin');
    if(!admin){
      admin={id:crypto.randomUUID(),login:adminLogin,name:'Administrateur',role:'admin',passwordHash:await bcrypt.hash(adminPass,12),createdAt:new Date().toISOString()};
      d.users.push(admin);
      save(d);
    }
    user={id:admin.id,login:adminLogin,name:admin.name||'Administrateur',role:'admin'};
  }else{
    const d=load();
    const u=d.users.find(x=>String(x.login||'').toLowerCase()===login);
    if(!u || !(await bcrypt.compare(password,u.passwordHash||''))){
      console.warn('Échec connexion utilisateur pour :',loginRaw||'(vide)');
      return res.status(401).json({error:'Identifiants incorrects'});
    }
    user={id:u.id,login:u.login,name:u.name||u.login,role:u.role||'user'};
  }

  // Nouvelle session à chaque connexion, puis sauvegarde AVANT la réponse.
  // Cela évite le cas où le navigateur appelle /api/portal avant que la session
  // ait été effectivement enregistrée derrière le proxy Render.
  req.session.regenerate(err=>{
    if(err){
      console.error('Régénération session impossible',err);
      return res.status(500).json({error:'Impossible de créer la session'});
    }
    req.session.user=user;
    req.session.save(err=>{
      if(err){
        console.error('Sauvegarde session impossible',err);
        return res.status(500).json({error:'Impossible d’enregistrer la session'});
      }
      console.log('Connexion réussie :',user.login,'('+user.role+')');
      res.json({ok:true,user});
    });
  });
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/portal',needLogin,(req,res)=>{
  const d=load();
  res.json({
    categories:[...d.categories].sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name,'fr')),
    apps:[...d.apps].sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name,'fr')),
    user:req.session.user
  });
});

app.get('/api/admin/users',needLogin,needAdmin,(req,res)=>{
  const d=load();
  res.json({users:d.users.map(({passwordHash,...u})=>u)});
});
app.post('/api/admin/users',needLogin,needAdmin,async(req,res)=>{
  const d=load();
  const login=String(req.body.login||'').trim();
  const name=String(req.body.name||'').trim();
  const password=String(req.body.password||'');
  const role=req.body.role==='admin'?'admin':'user';
  if(!login||!name||password.length<12)return res.status(400).json({error:'Nom, identifiant et mot de passe de 12 caractères minimum requis'});
  if(d.users.some(x=>x.login.toLowerCase()===login.toLowerCase()))return res.status(409).json({error:'Identifiant déjà utilisé'});
  d.users.push({id:crypto.randomUUID(),login,name,role,passwordHash:await bcrypt.hash(password,12),createdAt:new Date().toISOString()});
  save(d);res.json({ok:true});
});
app.delete('/api/admin/users/:id',needLogin,needAdmin,(req,res)=>{
  const d=load();
  const target=d.users.find(x=>x.id===req.params.id);
  if(!target)return res.status(404).json({error:'Utilisateur introuvable'});
  if(target.id===req.session.user.id)return res.status(400).json({error:'Vous ne pouvez pas supprimer votre propre compte'});
  d.users=d.users.filter(x=>x.id!==req.params.id);
  save(d);res.json({ok:true});
});

app.post('/api/admin/categories',needLogin,needAdmin,(req,res)=>{
  const d=load();const name=String(req.body.name||'').trim();
  if(!name)return res.status(400).json({error:'Nom requis'});
  const id=String(req.body.id||'').trim();
  if(id){
    const c=d.categories.find(x=>x.id===id); if(!c)return res.status(404).json({error:'Catégorie introuvable'});
    c.name=name;c.order=Number(req.body.order||c.order||10);
  }else d.categories.push({id:crypto.randomUUID(),name,order:Number(req.body.order||10)});
  save(d);res.json({ok:true});
});
app.delete('/api/admin/categories/:id',needLogin,needAdmin,(req,res)=>{
  const d=load();
  d.categories=d.categories.filter(x=>x.id!==req.params.id);
  d.apps=d.apps.filter(x=>x.categoryId!==req.params.id);
  save(d);res.json({ok:true});
});

const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,LOGO_DIR),
  filename:(req,file,cb)=>{
    const ext=(path.extname(file.originalname)||'.png').toLowerCase().replace(/[^a-z0-9.]/g,'');
    cb(null,crypto.randomUUID()+ext);
  }
});
const upload=multer({
  storage,
  limits:{fileSize:2*1024*1024},
  fileFilter:(req,file,cb)=>/^image\//.test(file.mimetype)?cb(null,true):cb(new Error('Image requise'))
});

app.post('/api/admin/apps',needLogin,needAdmin,upload.single('logo'),(req,res)=>{
  const d=load();
  const name=String(req.body.name||'').trim();
  const url=String(req.body.url||'').trim();
  const categoryId=String(req.body.categoryId||'').trim();
  if(!name||!url||!categoryId)return res.status(400).json({error:'Nom, lien et catégorie requis'});
  try{new URL(url)}catch{return res.status(400).json({error:'Lien invalide'})}
  const id=String(req.body.id||'').trim();
  if(id){
    const a=d.apps.find(x=>x.id===id);if(!a)return res.status(404).json({error:'Application introuvable'});
    a.name=name;a.url=url;a.categoryId=categoryId;
    a.description=String(req.body.description||'').trim();
    a.order=Number(req.body.order||a.order||10);
    if(req.file)a.logo='/assets/'+req.file.filename;
  }else{
    d.apps.push({
      id:crypto.randomUUID(),categoryId,name,url,
      description:String(req.body.description||'').trim(),
      logo:req.file?'/assets/'+req.file.filename:'',
      order:Number(req.body.order||10)
    });
  }
  save(d);res.json({ok:true});
});
app.delete('/api/admin/apps/:id',needLogin,needAdmin,(req,res)=>{
  const d=load(); d.apps=d.apps.filter(x=>x.id!==req.params.id); save(d);res.json({ok:true});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({error:err.message||'Erreur serveur'});
});
async function start(){
  console.log('Configuration démarrage', {
    environment: PROD?'production':'development',
    dataDir: DATA_DIR,
    adminLogin: String(process.env.PORTAL_ADMIN_LOGIN||'admin').trim(),
    adminPasswordConfigured: String(process.env.PORTAL_ADMIN_PASSWORD||'').length>0,
    sessionSecretConfigured: configuredSecret.length>=32
  });
  // Garantit que le compte administrateur initial existe avant d'accepter
  // la première tentative de connexion.
  await ensureAdmin();
  app.listen(PORT,()=>console.log('Portail PM Chalon sur le port',PORT));
}
start().catch(err=>{
  console.error('Démarrage impossible',err);
  process.exit(1);
});
