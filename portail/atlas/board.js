(function(root){
  'use strict';
  const activeStatuses = new Set(['ASSIGNED', 'DEPARTED', 'IN_PROGRESS', 'ONSCENE']);
  function normalize(value = '') {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').replace(/[’'\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function isCrewAssignable(crew, missions = []) {
    if (typeof crew.assignable === 'boolean') return crew.assignable;
    return String(crew.status).toUpperCase() === 'DISPO' && !missions.some(mission => String(mission.crewId) === String(crew.id) && activeStatuses.has(mission.status));
  }
  function createdTime(mission) { return Date.parse(mission.createdAt) || 0; }
  function compareMissions(a, b, order = 'priority') {
    if (order === 'newest') return createdTime(b) - createdTime(a);
    if (order === 'oldest') return createdTime(a) - createdTime(b);
    return Number(b.priority === 'URGENT') - Number(a.priority === 'URGENT') || createdTime(a) - createdTime(b);
  }
  function selectMissions(missions, { query = '', priority = 'all', order = 'priority' } = {}, crews = []) {
    const terms = normalize(query).split(' ').filter(Boolean);
    return missions.filter(mission => {
      if (priority !== 'all' && mission.priority !== priority) return false;
      const crew = crews.find(item => String(item.id) === String(mission.crewId));
      const text = normalize([mission.natureCode, mission.natureLabel, mission.number, mission.street, mission.complement, mission.notes, mission.crewCallsign, crew?.callsign].filter(Boolean).join(' '));
      return terms.every(term => text.includes(term));
    }).sort((a, b) => compareMissions(a, b, order));
  }
  function summary(missions, crews) {
    const waiting = missions.filter(mission => mission.status === 'WAITING');
    return { waiting: waiting.length, urgent: waiting.filter(mission => mission.priority === 'URGENT').length, active: missions.filter(mission => activeStatuses.has(mission.status)).length, available: crews.filter(crew => isCrewAssignable(crew, missions)).length };
  }
  function duration(from, now = Date.now()) {
    const timestamp = Date.parse(from);
    if (!Number.isFinite(timestamp)) return '—';
    const seconds = Math.floor(Math.max(0, now - timestamp) / 1000);
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
    return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
  }
  const board = { activeStatuses, normalize, isCrewAssignable, compareMissions, selectMissions, summary, duration };
  if (typeof module === 'object' && module.exports) module.exports = board;
  else root.AtlasBoard = board;
})(typeof window === 'undefined' ? globalThis : window);
