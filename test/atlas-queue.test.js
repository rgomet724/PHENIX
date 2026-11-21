'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const express=require('express');

test('Une création ATLAS reste en attente jusqu’à une affectation explicite',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-queue-test-'));
  const previous={ATLAS_DATA_DIR:process.env.ATLAS_DATA_DIR,PORTAL_DATA_DIR:process.env.PORTAL_DATA_DIR,CENTRAL_ADMIN_DATA_FILE:process.env.CENTRAL_ADMIN_DATA_FILE};
  process.env.ATLAS_DATA_DIR=process.env.PORTAL_DATA_DIR=directory;
  process.env.CENTRAL_ADMIN_DATA_FILE=path.join(directory,'admin.json');
  let phenix={users:[],crews:[{id:'crew-test',callsign:'TEST 1',status:'DISPO'}],interventions:[]};
  const secret='atlas-queue-isolated-test-secret-2026';
  const app=express();app.use(express.json());
  require('../atlas-router').mountInterventions(app,{loadPhenix:()=>phenix,savePhenix:data=>{phenix=data;},sessionSecret:secret});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(directory,{recursive:true,force:true});
    for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });
  const body=Buffer.from(JSON.stringify({sub:'env-admin',login:'queue-test',name:'Test',role:'admin',exp:Date.now()+60000})).toString('base64url');
  const token='v1.'+body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');
  const origin='http://127.0.0.1:'+server.address().port;
  const headers={'content-type':'application/json',authorization:'Bearer '+token};
  const missions=[];
  for(const assignment of [{},{assignmentMode:'auto'},{assignmentMode:'manual',crewId:'crew-test'}]){
    await t.test('Création '+JSON.stringify(assignment),async()=>{
      const response=await fetch(origin+'/portail/atlas/api/missions',{method:'POST',headers,body:JSON.stringify({natureLabel:'Intervention test',street:'Rue de test',priority:'URGENT',...assignment})});
      assert.equal(response.status,200);
      const {mission}=await response.json();missions.push(mission);
      assert.equal(mission.status,'WAITING');assert.equal(mission.crewId,'');assert.equal(mission.startedAt,null);assert.equal(mission.assignedAt,null);
      assert.equal(phenix.crews[0].status,'DISPO');
    });
  }
  await t.test('La mission démarre uniquement après Affecter',async()=>{
    const response=await fetch(origin+'/portail/atlas/api/missions/'+missions[0].id+'/assign',{method:'POST',headers,body:JSON.stringify({assignmentMode:'manual',crewId:'crew-test'})});
    assert.equal(response.status,200);
    const state=await (await fetch(origin+'/portail/atlas/api/state',{headers})).json();
    const assigned=state.missions.find(mission=>mission.id===missions[0].id);
    assert.equal(assigned.status,'IN_PROGRESS');assert.equal(assigned.crewId,'crew-test');assert.ok(assigned.startedAt);
    assert.equal(phenix.crews[0].status,'INDISPO');
    assert.equal(state.missions.filter(mission=>mission.status==='WAITING').length,2);
  });
});
