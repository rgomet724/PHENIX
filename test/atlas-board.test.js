'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectMissions, summary, isCrewAssignable, duration, activeStatuses } = require('../portail/atlas/board');

const missions = [
  { id:'normal-old', status:'WAITING', priority:'NORMAL', createdAt:'2026-11-21T10:00:00Z', natureLabel:'Stationnement gênant', number:'12 bis', street:'Rue de l’Église', notes:'Entrée du bâtiment B' },
  { id:'urgent-new', status:'WAITING', priority:'URGENT', createdAt:'2026-11-21T10:20:00Z', natureLabel:'Différend sur la voie publique', street:'Place de Beaune' },
  { id:'urgent-old', status:'WAITING', priority:'URGENT', createdAt:'2026-11-21T10:10:00Z', natureLabel:'Assistance à une personne', street:'Rue du Général Leclerc' },
  { id:'active', status:'IN_PROGRESS', priority:'NORMAL', createdAt:'2026-11-21T10:15:00Z', natureCode:'C17', natureLabel:'Accident', street:'Avenue de Paris', crewId:'2', crewCallsign:'BRAVO 2' }
];
const crews = [{id:'1', callsign:'ALPHA 1', status:'DISPO'}, {id:2, callsign:'BRAVO 2', status:'DISPO'}, {id:'3', callsign:'CHARLIE 3', status:'INDISPO'}];

test('La priorité passe avant l’ancienneté, puis les prioritaires sont classées de la plus ancienne à la plus récente', () => {
  const before = missions.map(mission => mission.id);
  assert.deepEqual(selectMissions(missions).map(mission => mission.id), ['urgent-old','urgent-new','normal-old','active']);
  assert.deepEqual(missions.map(mission => mission.id), before);
});
test('Les tris chronologiques respectent le choix de l’opérateur', () => {
  assert.deepEqual(selectMissions(missions,{order:'oldest'}).map(mission => mission.id), ['normal-old','urgent-old','active','urgent-new']);
  assert.deepEqual(selectMissions(missions,{order:'newest'}).map(mission => mission.id), ['urgent-new','active','urgent-old','normal-old']);
});
test('La recherche ignore les accents, la casse et les apostrophes typographiques', () => {
  assert.deepEqual(selectMissions(missions,{query:'12 BIS eglise GENANT'}).map(mission => mission.id), ['normal-old']);
  assert.deepEqual(selectMissions(missions,{query:"rue de l'eglise"}).map(mission => mission.id), ['normal-old']);
});
test('Tous les termes doivent correspondre, même répartis entre motif, adresse et observations', () => {
  assert.deepEqual(selectMissions(missions,{query:'stationnement batiment B'}).map(mission => mission.id), ['normal-old']);
  assert.equal(selectMissions(missions,{query:'stationnement inconnu'}).length,0);
});
test('La recherche porte aussi sur le code et la patrouille', () => {
  assert.deepEqual(selectMissions(missions,{query:'C17 bravo'}).map(mission => mission.id), ['active']);
  const renamed=[{...crews[1],callsign:'DELTA 4'}];
  assert.deepEqual(selectMissions(missions,{query:'delta'},renamed).map(mission => mission.id), ['active']);
});
test('Les filtres de priorité se combinent avec la recherche', () => {
  assert.deepEqual(selectMissions(missions,{priority:'URGENT',query:'voie'}).map(mission => mission.id), ['urgent-new']);
  assert.equal(selectMissions(missions,{priority:'NORMAL',query:'voie'}).length,0);
  assert.equal(selectMissions(missions,{query:'   '}).length,4);
});
test('Les indicateurs restent globaux et distinguent les urgences en attente des urgences déjà affectées', () => {
  const data=[...missions,{status:'ONSCENE',priority:'URGENT',crewId:'3'}, {status:'DONE',priority:'URGENT'}];
  selectMissions(data,{priority:'NORMAL'});
  assert.deepEqual(summary(data,crews),{waiting:3,urgent:2,active:2,available:1});
});
test('Une patrouille occupée reste indisponible même si PHENIX indique DISPO dans un ancien état', () => {
  for(const status of activeStatuses)assert.equal(isCrewAssignable(crews[1],[{crewId:'2',status}]),false);
  assert.equal(isCrewAssignable(crews[1],[{crewId:'2',status:'DONE'}]),true);
  assert.equal(isCrewAssignable(crews[2],[]),false);
});
test('L’indicateur assignable fourni par le serveur fait autorité', () => {
  assert.equal(isCrewAssignable({...crews[0],assignable:false},[]),false);
  assert.equal(isCrewAssignable({...crews[2],assignable:true},[]),true);
});
test('Les chronomètres gèrent les heures, les dates futures et les dates absentes', () => {
  const now=Date.parse('2026-11-21T12:00:00Z');
  assert.equal(duration('2026-11-21T11:59:35Z',now),'0 min 25 s');
  assert.equal(duration('2026-11-21T10:55:00Z',now),'1 h 05 min');
  assert.equal(duration('2026-11-21T13:00:00Z',now),'0 min 00 s');
  assert.equal(duration(undefined,now),'—');
  assert.equal(duration('invalide',now),'—');
});
test('Un tableau vide donne des indicateurs à zéro', () => {
  assert.deepEqual(summary([],[]),{waiting:0,urgent:0,active:0,available:0});
  assert.deepEqual(selectMissions([]),[]);
});
