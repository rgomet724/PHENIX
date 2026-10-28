'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const API = '/syrius/api';
  const COLORS = ['#4264d7', '#7653b3', '#198b78', '#bd7c2e', '#bd4d68'];
  const STATUS = { available: 'Disponible', busy: 'Occupé', away: 'Absent' };
  let state = null, csrfToken = '', selectedId = null, source = null, connected = false;
  let desiredChannel = null, joining = false, view = 'console', activity = 'messages';
  let toastTimer, geoWatch = null, audioVolume = .8, muted = false;
  let holding = false, starting = false, transmitting = false, attempt = 0;
  let grant = null, renewTimer, maxTalkTimer, stopping = null, preparingRadio = false;
  let messageSignature = '', eventSignature = '', markerSignature = '';
  let installPrompt = null;
  let stateRevision = -1;
  const clientId = crypto.randomUUID();
  const readPreference = key => { try { return localStorage.getItem(`syrius.${key}`); } catch { return null; } };
  const savePreference = (key, value) => { try { localStorage.setItem(`syrius.${key}`, value); } catch { /* navigation privée */ } };
  let callsign = readPreference('callsign') || '', myStatus = readPreference('status') || 'available';
  const initials = name => String(name || '?').split(/[\s·]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const time = value => new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const transport = new window.SyriusAudioTransport({ clientId, request,
    onState: () => renderAudio(),
    onAudio: receiveAudio,
    onLost: error => { if (holding || transmitting) { stopSpeaking(); toast(error.message, true); } }
  });
  const radio = new window.SyriusAudio({
    send: (packet, signal) => transport.send(packet, signal),
    finish: (floorId, sequence) => transport.finish(floorId, sequence),
    onState: () => renderRadio(),
    onInterrupted: () => { if (holding || transmitting) stopSpeaking(); },
    onError: error => { stopSpeaking(); toast(error.message, true); },
    onLevel: level => {
      $('mic-meter').value = Math.min(1, level * 3);
      $('mic-test-label').textContent = radio.monitoring ? level > .015 ? 'Votre voix est détectée' : 'Parlez pour tester le micro…' : 'Test local · aucune diffusion à la conférence';
    }
  });
  const inbox = new window.SyriusAudioInbox({ clientId, getChannel: () => desiredChannel,
    onPacket: packet => radio.receive(packet), onChannelChange: () => radio.resetPlayback()
  });
  const background = new window.SyriusBackgroundAudio({
    resume: () => { muted = false; updateVolume(); return Promise.all([radio.resumeExisting(), transport.open()]); },
    stopTransmission: () => { stopSpeaking(); radio.pauseMicrophone(); },
    pauseListening: () => { radio.context?.suspend().catch(() => {}); },
    canResume: () => Boolean(connected && state?.channelId && radio.context),
    getState: () => ({ active: Boolean(desiredChannel && radio.context), paused: !radio.listening || muted,
      title: !connected ? 'Reconnexion radio…' : state?.channels.find(channel => channel.id === desiredChannel)?.name || 'Radio', artist: state?.appearance?.title || 'PHENIX' }),
    onChange: () => renderAudio(), onError: error => toast(error.message, true)
  });
  background.enabled = readPreference('background-listening') !== 'false';
  const memberPicker = new window.SyriusMemberPicker({ list: $('channel-members'), search: $('channel-member-search'),
    summary: $('channel-member-summary'), empty: $('channel-member-empty'), clear: $('channel-member-clear') });

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function icon(name) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `/syrius/icons.svg#${name}`); node.append(use); node.setAttribute('aria-hidden', 'true');
    return node;
  }
  function empty(title, subtitle, symbol = 'radio') {
    const node = element('div', 'empty-state'); node.append(icon(symbol), element('strong', '', title));
    if (subtitle) node.append(element('span', '', subtitle));
    return node;
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
  }
  const run = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => toast(error.message, true));
  function showError(id, error) { $(id).textContent = error.message || error; $(id).hidden = false; }
  async function request(route, body, method = 'POST', signal) {
    const response = await fetch(`${API}${route}`, {
      method: body === undefined ? 'GET' : method, credentials: 'same-origin', signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && state) showAuth('Votre session a expiré. Reconnectez-vous.');
      throw Object.assign(new Error(result.error || 'Le service est momentanément indisponible.'), { status: response.status });
    }
    return result;
  }

  function showAuth(message) {
    connected = false; desiredChannel = null;
    source?.close(); source = null; stopSpeaking(); transport.close(); stopLocation(); radio.resetPlayback(); radio.disableMicrophone(); state = null;
    $('boot-screen').hidden = true; $('app-shell').hidden = true; $('auth-screen').hidden = false;
    if (message) showError('login-error', message);
  }
  async function bootstrap() {
    try {
      const result = await request('/bootstrap'); csrfToken = result.csrfToken;
      state = result; selectedId = state.channels.find(channel => !channel.archived)?.id || null;
      callsign = callsign || state.user.name;
      $('boot-screen').hidden = true; $('auth-screen').hidden = true; $('app-shell').hidden = false;
      render(); connect();
    } catch (error) { showAuth(error.status === 401 ? '' : error.message); }
  }
  function connect() {
    source?.close(); source = new EventSource(`${API}/stream?clientId=${encodeURIComponent(clientId)}`);
    let initialized = false;
    source.onopen = () => { connected = true; initialized = false; stateRevision = -1; inbox.resetConnection(); renderConnection(); };
    source.onerror = () => { connected = false; stopSpeaking(); transport.close(); renderConnection(); renderRadio(); };
    source.addEventListener('expired', () => showAuth('Votre session ou votre accès SYRIUS a expiré.'));
    source.addEventListener('audio', event => receiveAudio(JSON.parse(event.data)));
    source.addEventListener('state', event => {
      const previousChannel = state?.channelId;
      const next = JSON.parse(event.data);
      if (Number.isInteger(next.revision) && next.revision < stateRevision) return;
      stateRevision = next.revision ?? stateRevision;
      state = next;
      if (!state.channels.some(channel => channel.id === selectedId && !channel.archived)) selectedId = state.channels.find(channel => !channel.archived)?.id || null;
      if (!state.channels.some(channel => channel.id === desiredChannel && !channel.archived)) desiredChannel = null;
      const currentFloor = state.channels.find(channel => channel.id === state.channelId)?.floor;
      if (previousChannel && !state.channelId && !desiredChannel) radio.resetPlayback();
      if (previousChannel && !state.channelId) { radio.pauseMicrophone(); transport.close(); }
      if (transmitting && currentFloor?.clientId !== clientId) stopSpeaking();
      if (geoWatch !== null && !state.channelId) stopLocation();
      if (state.user.role !== 'admin' && view === 'admin') setView('console');
      render();
      if (!initialized) {
        initialized = true;
        const presence = { clientId, callsign, status: myStatus, audioCodecs: ['mulaw8'] };
        if (desiredChannel) presence.channelId = desiredChannel;
        request('/presence', presence).then(() => { if (state?.channelId && radio.context) transport.open(); }).catch(error => toast(error.message, true));
      }
    });
  }
  function receiveAudio(packet) {
    if (!state) return;
    try { inbox.receive(packet); } catch { toast('Un fragment audio n’a pas pu être lu. Vérifiez la connexion.', true); }
  }

  function render() {
    if (!state) return;
    $('user-name').textContent = state.user.name; $('user-initials').textContent = initials(state.user.name);
    $('user-role').textContent = state.user.role === 'admin' ? 'Administrateur radio' : 'Opérateur radio';
    window.applySyriusAppearance(state.appearance);
    document.querySelectorAll('.admin-only').forEach(node => { node.hidden = state.user.role !== 'admin'; });
    $('my-callsign').textContent = callsign || state.user.name;
    $('my-status').textContent = STATUS[myStatus] || 'Disponible';
    renderConnection(); renderChannels(); renderRadio(); renderActivity(); renderAdmin(); renderMarkers();
  }
  function renderConnection() {
    $('connection-dot').classList.toggle('connected', connected);
    $('connection-label').textContent = connected ? 'Serveur PHENIX connecté' : 'Reconnexion en cours…';
    $('footer-status').textContent = connected ? 'Liaison serveur active' : 'Liaison serveur interrompue';
    $('footer-dot').style.background = connected ? '#35a779' : '#d8a456';
    const joined = state?.channels.find(channel => channel.id === state.channelId);
    $('footer-channel').textContent = joined ? `En conférence · ${joined.name}` : 'Aucune conférence rejointe';
  }
  function renderChannels() {
    const active = state.channels.filter(channel => !channel.archived);
    const query = $('channel-search').value.trim().toLocaleLowerCase('fr');
    const channels = active.filter(channel => `${channel.name} ${channel.description}`.toLocaleLowerCase('fr').includes(query));
    $('channel-count').textContent = active.length;
    const nodes = channels.map(channel => {
      const button = element('button', `channel-row${channel.id === selectedId ? ' selected' : ''}${channel.id === state.channelId ? ' joined' : ''}`);
      button.style.setProperty('--channel-color', channel.color);
      button.setAttribute('aria-label', `${channel.name}, ${channel.participantCount} poste${channel.participantCount > 1 ? 's' : ''}`);
      button.setAttribute('aria-pressed', String(channel.id === selectedId));
      button.title = channel.description;
      const symbol = element('span', 'channel-symbol'); symbol.append(icon('groups'));
      const copy = element('span', 'channel-text');
      copy.append(element('strong', '', channel.name), element('small', '', `${channel.audience === 'selected' || channel.memberIds.length ? 'Privée · ' : ''}${channel.id === state.channelId ? 'Conférence rejointe' : `${channel.participantCount} poste${channel.participantCount > 1 ? 's' : ''} en ligne`}`));
      button.append(symbol, copy, element('span', 'join-indicator'));
      button.addEventListener('click', run(async () => {
        if (selectedId === channel.id) { if (window.matchMedia('(max-width: 900px)').matches) setView('console'); return; }
        selectedId = channel.id; messageSignature = ''; eventSignature = ''; render();
        if (state.channelId) await joinChannel(channel.id);
        if (window.matchMedia('(max-width: 900px)').matches) setView('console');
      }));
      return button;
    });
    $('channel-list').replaceChildren(...(nodes.length ? nodes : [empty(active.length ? 'Aucun résultat' : 'Aucune conférence ouverte', active.length ? 'Essayez un autre nom.' : 'Un administrateur peut créer votre premier groupe.')]));
  }
  function selectedChannel() { return state?.channels.find(channel => channel.id === selectedId && !channel.archived); }
  function renderRadio() {
    if (!state) return;
    const channel = selectedChannel(), joined = channel && state.channelId === channel.id;
    const floor = joined ? channel.floor : null;
    const me = floor?.clientId === clientId;
    $('selected-channel-name').textContent = channel?.name || 'Aucune conférence ouverte';
    $('call-card').style.setProperty('--channel-color', state.appearance?.accentColor || channel?.color || COLORS[0]);
    $('call-member-count').textContent = channel?.participantCount || 0;
    $('floor-label').textContent = !connected ? 'Liaison interrompue' : !joined ? 'Canal disponible' : floor ? `${me ? 'Transmission' : 'Réception'} · ${floor.name}` : 'Écoute · canal disponible';
    $('floor-dot').className = `floor-dot${floor ? me ? ' live' : ' busy' : ''}`;
    setPttDisabled(!connected || !joined || !radio.microphoneReady || preparingRadio || Boolean(stopping) || Boolean(floor && !me));
    $('ptt-button').setAttribute('aria-pressed', String(transmitting && me));
    $('ptt-button').classList.toggle('transmitting', transmitting && me);
    $('ptt-button').classList.toggle('receiving', Boolean(floor && !me));
    $('ptt-text').textContent = transmitting && me ? 'ÉMISSION' : floor && !me ? 'ÉCOUTE' : starting ? 'CONNEXION' : 'PTT';
    $('ptt-hint').textContent = !joined ? 'Rejoignez une conférence' : stopping ? 'Fin d’émission…' : preparingRadio ? 'Activation de la radio…' : !radio.microphoneReady ? 'Activez la radio pour parler' : transmitting ? 'Vous avez la parole' : floor && !me ? `${floor.name} a la parole` : starting ? 'Prise de parole…' : !radio.listening ? 'Maintenir pour reprendre la radio' : 'Maintenir pour parler';
    $('mobile-channel-name').textContent = channel?.name || 'Choisir une conférence';
    $('mobile-channel-detail').textContent = joined ? `${channel.participantCount} poste${channel.participantCount > 1 ? 's' : ''} · conférence rejointe` : 'Touchez pour choisir votre groupe';
    $('join-channel').disabled = !connected || !channel || joining;
    $('join-channel').classList.toggle('joined', Boolean(joined));
    $('join-channel').textContent = joining ? 'Connexion…' : joined ? 'Quitter la conférence' : 'Rejoindre la conférence';
    $('sos-button').disabled = !connected || !joined;
    $('share-location').disabled = !connected || !joined;
    $('share-location').querySelector('span').textContent = geoWatch === null ? 'Partager ma position' : 'Arrêter le partage';
    const peers = joined ? state.peers.filter(peer => peer.channelId === selectedId) : [];
    $('participant-count').textContent = peers.length;
    $('participant-list').replaceChildren(...(peers.length ? peers.map(peer => {
      const row = element('div', 'participant-row');
      const avatar = element('span', 'participant-avatar', initials(peer.name));
      const copy = element('div', 'participant-copy'); copy.append(element('strong', '', peer.name), element('small', '', `${peer.clientId === clientId ? 'Votre poste · ' : ''}${STATUS[peer.status] || 'Disponible'}`));
      const dot = element('span', 'presence-dot'); dot.style.background = peer.status === 'busy' ? '#d9a34f' : peer.status === 'away' ? '#bcc5d4' : '#35a779';
      row.append(avatar, copy, dot); return row;
    }) : [empty(joined ? 'Vous êtes le premier poste' : 'Participants de la conférence', joined ? 'Les autres postes apparaîtront à leur connexion.' : 'Rejoignez le groupe pour voir les postes connectés.', 'headset')]));
    renderAudio();
  }
  function renderAudio() {
    const joined = Boolean(state?.channelId && state.channelId === selectedId);
    $('prepare-radio').hidden = (radio.ready && !preparingRadio) || !joined;
    $('prepare-radio').disabled = preparingRadio || !connected;
    $('prepare-radio').textContent = preparingRadio ? 'Activation de la radio…' : 'Activer le micro et le son';
    $('audio-unlock').hidden = !joined || radio.listening;
    $('audio-state').textContent = !joined ? 'Choisissez puis rejoignez une conférence' : !radio.listening ? 'Écoute à activer' : radio.ready ? 'Son activé · micro transmis pendant le PTT' : 'Écoute activée · microphone à activer';
    $('audio-state').classList.toggle('ready', joined && radio.ready);
    $('audio-connection-detail').textContent = !connected ? 'Serveur déconnecté · reconnexion en cours' : transport.ready ? 'Connexion audio continue active' : 'Serveur connecté · liaison audio de secours HTTPS';
    $('background-listening').checked = background.enabled;
    $('audio-quality-detail').textContent = !joined ? 'Rejoignez une conférence pour écouter.' : muted ? 'Son coupé · rétablissez le volume pour écouter.' : !radio.listening ? 'Le téléphone a suspendu le son. Touchez « Activer l’écoute seule » pour reprendre.' : radio.jitter > .1 ? 'Délai réseau variable : la réserve audio s’adapte.' : 'Voix compressée · écoute active';
    background.update();
    setPttDisabled(!connected || !joined || !radio.microphoneReady || preparingRadio || Boolean(stopping) || Boolean(selectedChannel()?.floor && selectedChannel().floor.clientId !== clientId));
  }
  function setPttDisabled(disabled) { $('ptt-button').setAttribute('aria-disabled', String(Boolean(disabled))); }
  const pttDisabled = () => $('ptt-button').getAttribute('aria-disabled') === 'true';
  function renderActivity() {
    const channel = selectedChannel(); $('activity-channel').textContent = channel?.name || '';
    $('message-input').disabled = !channel || !connected; $('send-message').disabled = !channel || !connected;
    const messages = state.messages.filter(message => message.channelId === selectedId);
    const signature = `${selectedId}:${messages.map(message => message.id).join()}`;
    if (signature !== messageSignature) {
      const container = $('message-list'), bottom = container.scrollHeight - container.scrollTop - container.clientHeight < 70;
      const changedChannel = !messageSignature.startsWith(`${selectedId}:`);
      messageSignature = signature;
      container.replaceChildren(...(messages.length ? messages.map(message => {
        const row = element('article', `message-row${message.userId === state.user.id ? ' own' : ''}`);
        const copy = element('div', 'message-content'), header = element('header');
        header.append(element('strong', '', message.name), element('time', '', time(message.at)));
        copy.append(header, element('p', '', message.text)); row.append(element('span', 'message-avatar', initials(message.name)), copy); return row;
      }) : [empty('La liaison commence ici', 'Les messages de la conférence s’affichent dans cet espace.', 'message')]));
      if (bottom || changedChannel) container.scrollTop = container.scrollHeight;
    }
    const events = state.events.filter(item => item.channelId === selectedId);
    const eventKey = `${selectedId}:${events.map(item => item.id).join()}`;
    if (eventKey !== eventSignature) {
      eventSignature = eventKey;
      $('event-list').replaceChildren(...(events.length ? events.map(item => {
        const row = element('article', 'event-row'), copy = element('div');
        copy.append(element('strong', '', item.detail), element('span', '', item.name));
        row.append(element('time', '', time(item.at)), icon(item.kind === 'radio' ? 'mic' : item.kind === 'alert' ? 'alert' : 'settings'), copy); return row;
      }) : [empty('Aucun événement pour le moment', 'Les prises de parole et les actions du groupe seront consignées ici.', 'history')]));
    }
    const alert = state.alerts.find(item => item.channelId === selectedId && !item.acknowledgedBy);
    $('alert-banner').hidden = !alert;
    if (alert) {
      const nodes = [icon('alert'), element('span', '', `${alert.name} · ${alert.text} · ${time(alert.at)}`)];
      if (state.user.role === 'admin') {
        const button = element('button', '', 'Prendre en compte'); button.addEventListener('click', run(() => request(`/alerts/${alert.id}/ack`, {}))); nodes.push(button);
      }
      $('alert-banner').replaceChildren(...nodes);
    }
  }
  function renderAdmin() {
    if (state.user.role !== 'admin') return;
    if ($('channel-dialog').open) memberPicker.refresh(state.users);
    $('stat-channels').textContent = state.channels.filter(channel => !channel.archived).length;
    $('stat-connected').textContent = state.channels.reduce((sum, channel) => sum + channel.participantCount, 0);
    $('stat-alerts').textContent = state.alerts.filter(alert => !alert.acknowledgedBy).length;
    const channels = state.channels.filter(channel => !channel.archived || $('show-archived').checked);
    const rows = channels.map(channel => {
      const row = element('tr'), titleCell = element('td'), title = element('div', 'table-channel');
      const symbol = element('span', 'channel-symbol'); symbol.style.setProperty('--channel-color', channel.color); symbol.append(icon('groups'));
      const copy = element('div'); copy.append(element('strong', '', channel.name), element('small', '', channel.description || 'Groupe d’appel PHENIX'));
      title.append(symbol, copy); titleCell.append(title);
      const status = element('td'); status.append(element('span', `state-tag${channel.archived ? ' archived' : ''}`, channel.archived ? 'Archivée' : 'Ouverte'));
      const actionsCell = element('td'), actions = element('div', 'table-actions');
      const edit = element('button', 'icon-button'); edit.title = `Modifier ${channel.name}`; edit.setAttribute('aria-label', edit.title); edit.append(icon('edit')); edit.addEventListener('click', () => openChannel(channel));
      const archive = element('button', 'icon-button archiver'); archive.title = `${channel.archived ? 'Réouvrir' : 'Archiver'} ${channel.name}`; archive.setAttribute('aria-label', archive.title); archive.append(icon(channel.archived ? 'history' : 'archive'));
      archive.addEventListener('click', run(async () => { await request(`/channels/${channel.id}/archive`, { archived: !channel.archived }); toast(channel.archived ? 'Conférence réouverte.' : 'Conférence archivée. Vous pourrez la réouvrir depuis les archives.'); }));
      const members = element('button', 'button small manage-channel-members', 'Agents'); members.type = 'button';
      members.setAttribute('aria-label', `Choisir les agents autorisés pour ${channel.name}`);
      members.addEventListener('click', () => { openChannel(channel); $('channel-audience').focus(); });
      actions.append(members, edit, archive); actionsCell.append(actions);
      const audience = element('td', '', channel.audience === 'selected' || channel.memberIds.length ? `Privée · ${channel.memberIds.length} agent${channel.memberIds.length > 1 ? 's' : ''} sélectionné${channel.memberIds.length > 1 ? 's' : ''}` : 'Tous les agents');
      const count = element('td', '', String(channel.participantCount));
      audience.dataset.label = 'Accès'; count.dataset.label = 'Participants'; status.dataset.label = 'État';
      row.append(titleCell, audience, count, status, actionsCell);
      return row;
    });
    if (!rows.length) { const row = element('tr'), cell = element('td'); cell.colSpan = 5; cell.append(empty('Aucune conférence', 'Créez un groupe pour commencer.')); row.append(cell); rows.push(row); }
    $('admin-channels').replaceChildren(...rows);
  }

  function setView(next) {
    view = next; document.body.dataset.view = next;
    document.querySelectorAll('button[data-view]').forEach(button => {
      button.classList.toggle('active', button.dataset.view === next);
      if (button.dataset.view === next) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('admin-view').hidden = next !== 'admin'; $('console-view').hidden = next === 'admin';
    if (next === 'messages' || next === 'journal') setActivity(next);
    if (next === 'console' || next === 'map') requestAnimationFrame(drawMap);
    if (state) renderAdmin();
  }
  function setActivity(next) {
    activity = next;
    $('messages-pane').hidden = next !== 'messages'; $('journal-pane').hidden = next !== 'journal';
    $('messages-tab').classList.toggle('active', next === 'messages'); $('journal-tab').classList.toggle('active', next === 'journal');
    $('messages-tab').setAttribute('aria-selected', String(next === 'messages')); $('journal-tab').setAttribute('aria-selected', String(next === 'journal'));
  }
  async function joinChannel(id) {
    if (joining) return;
    // L’écoute s’active sur le clic, avant la requête de présence.
    const listening = id ? radio.enableListening().catch(error => toast(error.message, true)) : Promise.resolve();
    joining = true; desiredChannel = id; stopLocation(); renderRadio();
    try {
      await stopSpeaking(); radio.resetPlayback();
      if (!id) { radio.pauseMicrophone(); transport.close(); }
      await request('/presence', { clientId, channelId: id, audioCodecs: ['mulaw8'] }); await listening;
      if (id) await transport.open();
    }
    catch (error) { desiredChannel = state.channelId; throw error; }
    finally { joining = false; renderRadio(); }
  }

  function openChannel(channel) {
    $('channel-form').reset(); $('channel-form-error').hidden = true;
    $('channel-id').value = channel?.id || '';
    $('channel-name').value = channel?.name || ''; $('channel-description').value = channel?.description || '';
    $('channel-dialog-title').textContent = channel ? 'Modifier la conférence' : 'Nouvelle conférence';
    $('channel-submit').textContent = channel ? 'Enregistrer les modifications' : 'Créer la conférence';
    $('channel-audience').value = channel?.audience === 'selected' || channel?.memberIds.length ? 'selected' : 'all';
    $('member-fieldset').hidden = $('channel-audience').value !== 'selected';
    $('channel-colors').replaceChildren(...COLORS.map((color, index) => {
      const label = element('label', 'color-option'), input = element('input');
      input.type = 'radio'; input.name = 'channel-color'; input.value = color;
      input.setAttribute('aria-label', ['Bleu', 'Violet', 'Vert', 'Ambre', 'Rose'][index]);
      input.checked = color === (channel?.color || COLORS[0]);
      const swatch = element('span'); swatch.style.setProperty('--swatch', color); label.append(input, swatch); return label;
    }));
    memberPicker.open(state.users, channel?.memberIds || []);
    $('channel-dialog').showModal();
  }

  // L’activation du micro est distincte du maintien du PTT : une demande
  // d’autorisation du navigateur ne peut plus annuler la première émission.
  function microphoneError(error) {
    return error.name === 'NotAllowedError' ? 'Microphone refusé. Autorisez le micro dans les réglages du site, puis touchez « Activer le micro et le son ».' : error.name === 'NotFoundError' ? 'Aucun microphone détecté sur cet appareil.' : error.name === 'NotReadableError' ? 'Le microphone est utilisé par une autre application. Fermez-la puis réessayez.' : error.message;
  }
  async function prepareRadio() {
    if (preparingRadio) return;
    preparingRadio = true; background.userPaused = false; renderAudio();
    try {
      await Promise.all([radio.prepareMicrophone(), transport.open()]);
      if (radio.ready) toast('Radio prête. Maintenez PTT pour parler.');
    }
    catch (error) { toast(microphoneError(error), true); }
    finally { preparingRadio = false; renderRadio(); }
  }
  function stopSpeaking() {
    holding = false; attempt++;
    clearInterval(renewTimer); clearTimeout(maxTalkTimer);
    transmitting = false;
    if (stopping) return stopping;
    if (!grant) { renderRadio(); return Promise.resolve(); }
    grant = null;
    stopping = radio.stopCapture().then(() => request('/floor', { clientId, action: 'release' }))
      .catch(error => { if (connected && state) toast(error.message, true); })
      .finally(() => { stopping = null; renderRadio(); });
    renderRadio(); return stopping;
  }
  async function startSpeaking() {
    if (starting || holding || stopping || preparingRadio || !connected || state?.channelId !== selectedId || !radio.microphoneReady) return;
    starting = true; holding = true; const currentAttempt = ++attempt; renderRadio();
    try {
      await Promise.all([radio.enableListening(), transport.open()]);
      if (!holding || currentAttempt !== attempt) return;
      const result = await request('/floor', { clientId, action: 'claim' });
      stateRevision = Math.max(stateRevision, result.revision ?? -1);
      if (!holding || currentAttempt !== attempt) { await request('/floor', { clientId, action: 'release' }); return; }
      grant = result.floor; radio.startCapture(grant.id); transport.startFloor(grant.id); transmitting = true; renderRadio();
      renewTimer = setInterval(() => request('/floor', { clientId, action: 'renew' }).catch(error => { stopSpeaking(); toast(error.message, true); }), 7000);
      maxTalkTimer = setTimeout(() => { stopSpeaking(); toast('Alternat libéré après 60 secondes.'); }, 60000);
      if (!result.recipients.length) toast('Vous êtes seul dans cette conférence. Connectez un second poste pour vous entendre.');
    } catch (error) { stopSpeaking(); toast(microphoneError(error), true); }
    finally { starting = false; renderRadio(); }
  }

  function stopLocation() { if (geoWatch !== null) navigator.geolocation?.clearWatch(geoWatch); geoWatch = null; }
  function toggleLocation() {
    if (geoWatch !== null) {
      stopLocation(); request('/presence', { clientId, position: null }).catch(error => toast(error.message, true)); renderRadio(); return;
    }
    if (!navigator.geolocation) { toast('La géolocalisation n’est pas disponible sur ce navigateur.', true); return; }
    let first = true, lastSent = 0;
    geoWatch = navigator.geolocation.watchPosition(position => {
      if (Date.now() - lastSent < 10000 && !first) return;
      lastSent = Date.now();
      request('/presence', { clientId, position: { lat: position.coords.latitude, lng: position.coords.longitude } }).then(() => {
        if (first) { first = false; center = { lat: position.coords.latitude, lng: position.coords.longitude }; drawMap(); toast('Position partagée avec votre conférence.'); }
      }).catch(error => { stopLocation(); renderRadio(); toast(error.message, true); });
    }, () => { stopLocation(); renderRadio(); toast('Position indisponible. Vérifiez l’autorisation de géolocalisation du navigateur.', true); }, { enableHighAccuracy: false, maximumAge: 15000, timeout: 15000 });
    renderRadio();
  }

  // Carte légère sans bibliothèque externe. Le navigateur conserve le cache des tuiles OSM.
  let center = { lat: 46.781, lng: 4.854 }, zoom = 14, mapFrame, tileFailures = 0, dragging = null;
  const tileCache = new Map();
  function project(point, level = zoom) {
    const scale = 256 * 2 ** level, lat = Math.max(-85, Math.min(85, point.lat)) * Math.PI / 180;
    return { x: (point.lng + 180) / 360 * scale, y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * scale };
  }
  function unproject(point) {
    const scale = 256 * 2 ** zoom;
    return { lng: ((point.x / scale * 360 - 180 + 540) % 360) - 180, lat: Math.max(-85, Math.min(85, Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y / scale))) * 180 / Math.PI)) };
  }
  function drawMap() {
    const map = $('tactical-map'), width = map.clientWidth, height = map.clientHeight;
    if (!width || !height) return;
    const pixel = project(center), left = pixel.x - width / 2, top = pixel.y - height / 2, visible = new Set(), count = 2 ** zoom;
    for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
      for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
        if (y < 0 || y >= count) continue;
        const tileX = ((x % count) + count) % count, key = `${zoom}/${tileX}/${y}`; visible.add(key);
        let img = tileCache.get(key);
        if (!img) {
          img = new Image(); img.alt = ''; img.draggable = false; img.referrerPolicy = 'strict-origin-when-cross-origin';
          img.src = `https://tile.openstreetmap.org/${key}.png`;
          img.onerror = () => { img.style.visibility = 'hidden'; tileFailures++; $('map-fallback-notice').hidden = false; };
          img.onload = () => { if (!tileFailures) $('map-fallback-notice').hidden = true; };
          tileCache.set(key, img);
        }
        img.style.left = `${x * 256 - left}px`; img.style.top = `${y * 256 - top}px`;
        if (!img.isConnected) $('map-tiles').append(img);
      }
    }
    for (const [key, img] of tileCache) if (!visible.has(key)) img.remove();
    if (tileCache.size > 100) for (const [key] of tileCache) { if (!visible.has(key)) tileCache.delete(key); if (tileCache.size <= 60) break; }
    renderMarkers(true);
  }
  function scheduleMap() { cancelAnimationFrame(mapFrame); mapFrame = requestAnimationFrame(drawMap); }
  function renderMarkers(force = false) {
    if (!state) return;
    const peers = state.peers.filter(peer => peer.position && peer.channelId === selectedId);
    const signature = JSON.stringify(peers.map(peer => [peer.clientId, peer.position, peer.name]));
    if (!force && signature === markerSignature) return;
    markerSignature = signature;
    const map = $('tactical-map'), middle = project(center), width = map.clientWidth, height = map.clientHeight;
    $('map-online-count').textContent = `${peers.length} position${peers.length > 1 ? 's' : ''} partagée${peers.length > 1 ? 's' : ''}`;
    $('map-empty').hidden = peers.length > 0;
    $('map-markers').replaceChildren(...peers.map(peer => {
      const location = project(peer.position), marker = element('div', 'map-marker'), dot = element('span', 'marker-dot'); dot.append(icon('radio'));
      marker.style.left = `${location.x - middle.x + width / 2}px`; marker.style.top = `${location.y - middle.y + height / 2}px`;
      marker.title = `${peer.name} · position à ${time(peer.position.at)}`; marker.append(element('span', 'marker-label', peer.name), dot); return marker;
    }));
  }

  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; $('login-error').hidden = true;
    try {
      await request('/login', { login: $('login').value.trim(), password: $('password').value });
      $('password').value = '';
      await bootstrap();
    } catch (error) { showError('login-error', error); } finally { button.disabled = false; }
  });
  document.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => {
    setView(button.dataset.view); $('mobile-menu-dialog').close();
  }));
  $('messages-tab').addEventListener('click', () => { setActivity('messages'); if (view === 'journal') setView('messages'); });
  $('journal-tab').addEventListener('click', () => { setActivity('journal'); if (view === 'messages') setView('journal'); });
  $('channel-search').addEventListener('input', () => state && renderChannels());
  $('join-channel').addEventListener('click', () => joinChannel(state.channelId === selectedId ? null : selectedId).catch(error => toast(error.message, true)));
  $('new-channel').addEventListener('click', () => openChannel()); $('admin-new-channel').addEventListener('click', () => openChannel());
  $('show-archived').addEventListener('change', () => renderAdmin());
  $('channel-audience').addEventListener('change', () => { $('member-fieldset').hidden = $('channel-audience').value !== 'selected'; });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('audio-dialog').addEventListener('close', () => radio.stopMicrophoneTest());
  $('mobile-menu-button').addEventListener('click', () => $('mobile-menu-dialog').showModal());
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.open !== 'mobile-menu-dialog') $('mobile-menu-dialog').close();
    $(button.dataset.open).showModal();
  }));
  $('channel-form').addEventListener('submit', async event => {
    event.preventDefault(); $('channel-form-error').hidden = true; const button = $('channel-submit'); button.disabled = true;
    try {
      const audience = $('channel-audience').value, memberIds = audience === 'selected' ? memberPicker.memberIds : [];
      const body = { name: $('channel-name').value, description: $('channel-description').value, color: $('channel-colors').querySelector('input:checked').value, audience, memberIds };
      const id = $('channel-id').value, result = await request(id ? `/channels/${id}` : '/channels', body, id ? 'PATCH' : 'POST');
      if (result.channel) selectedId = result.channel.id;
      $('channel-dialog').close(); render(); toast(id ? 'Conférence mise à jour.' : 'Conférence créée. Elle est maintenant disponible.');
    } catch (error) { showError('channel-form-error', error); } finally { button.disabled = false; }
  });
  $('message-form').addEventListener('submit', async event => {
    event.preventDefault(); const input = $('message-input'), message = input.value.trim(); if (!message) return;
    $('send-message').disabled = true;
    try { await request('/messages', { channelId: selectedId, text: message }); input.value = ''; input.focus(); }
    catch (error) { toast(error.message, true); } finally { $('send-message').disabled = !connected; }
  });
  $('profile-button').addEventListener('click', () => { $('callsign-input').value = callsign; $('status-select').value = myStatus; $('profile-error').hidden = true; $('profile-dialog').showModal(); });
  $('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const name = $('callsign-input').value.trim(), status = $('status-select').value;
      await request('/presence', { clientId, callsign: name, status }); callsign = name; myStatus = status;
      savePreference('callsign', callsign); savePreference('status', myStatus); $('profile-dialog').close(); render();
    } catch (error) { showError('profile-error', error); }
  });
  $('logout-button').addEventListener('click', run(async () => {
    await stopSpeaking(); await request('/logout', {});
    $('profile-dialog').close(); showAuth();
  }));
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('sos-button').addEventListener('click', () => $('sos-dialog').showModal());
  $('sos-form').addEventListener('submit', async event => {
    event.preventDefault(); event.submitter.disabled = true;
    try { await request('/alerts', { clientId, text: $('sos-message').value }); $('sos-dialog').close(); toast('Alerte diffusée à votre conférence.'); }
    catch (error) { toast(error.message, true); } finally { event.submitter.disabled = false; }
  });
  $('share-location').addEventListener('click', toggleLocation);
  window.bindSyriusPtt({ button: $('ptt-button'), surface: $('ptt-button').closest('.ptt-wrap'), canStart: () => !pttDisabled(), start: startSpeaking, stop: stopSpeaking });
  document.addEventListener('keydown', event => {
    if (!['Space', 'Enter'].includes(event.code) || (event.code === 'Enter' && event.target !== $('ptt-button')) || event.repeat || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT|A/.test(event.target.tagName) || event.target.isContentEditable || pttDisabled()) return;
    if (event.target.tagName === 'BUTTON' && event.target !== $('ptt-button')) return;
    event.preventDefault(); startSpeaking();
  });
  document.addEventListener('keyup', event => { if (['Space', 'Enter'].includes(event.code) && holding) { event.preventDefault(); stopSpeaking(); } });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { loadAppearance(); transport.probe(); renderRadio(); }
  });
  // Reprendre le haut-parleur sur le premier geste après une suspension iOS,
  // en réutilisant le contexte et sans demander à nouveau le microphone.
  document.addEventListener('pointerdown', () => {
    if (radio.context && !radio.listening && background.canAutoResume) radio.resumeExisting().catch(() => {});
  }, { capture: true });
  async function loadAppearance() {
    try {
      const response = await fetch('/syrius/branding', { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      if (state) state.appearance = result.appearance;
      window.applySyriusAppearance(result.appearance);
    } catch { /* la liaison radio gère déjà l’état de connexion */ }
  }
  function updateVolume() {
    radio.setVolume(audioVolume, muted);
    $('volume-value').textContent = muted ? '0' : Math.round(audioVolume * 100);
    $('mute-button').replaceChildren(icon(muted ? 'muted' : 'volume'));
    $('mute-button').setAttribute('aria-label', muted ? 'Rétablir le son' : 'Couper le son');
    renderAudio();
  }
  $('volume-slider').addEventListener('input', event => { audioVolume = Number(event.target.value) / 100; muted = false; updateVolume(); });
  $('mute-button').addEventListener('click', () => { muted = !muted; updateVolume(); });
  $('audio-unlock').addEventListener('click', () => { background.userPaused = false; radio.resumeExisting().catch(error => toast(error.message, true)); });
  $('background-listening').addEventListener('change', event => { background.enabled = event.target.checked; savePreference('background-listening', String(background.enabled)); background.update(); });
  $('prepare-radio').addEventListener('click', prepareRadio);
  $('audio-enable-mic').addEventListener('click', prepareRadio);
  $('speaker-test').addEventListener('click', () => radio.testSpeaker().catch(error => toast(error.message, true)));
  $('microphone-test').addEventListener('click', () => radio.testMicrophone().catch(error => toast(microphoneError(error), true)));
  $('disable-microphone').addEventListener('click', async () => { await stopSpeaking(); radio.disableMicrophone(); renderRadio(); });
  $('install-app').addEventListener('click', async () => {
    $('mobile-menu-dialog').close();
    if (installPrompt) { await installPrompt.prompt(); installPrompt = null; }
    else $('install-dialog').showModal();
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('appinstalled', () => { installPrompt = null; toast('SYRIUS est installé sur votre appareil.'); });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/syrius/sw.js', { scope: '/syrius/', updateViaCache: 'none' }).catch(() => {});
  }
  window.addEventListener('offline', () => { connected = false; stopSpeaking(); transport.close(); renderRadio(); renderConnection(); });
  window.addEventListener('online', () => { if (state?.channelId) transport.open(); });
  $('map-zoom-in').addEventListener('click', () => { zoom = Math.min(18, zoom + 1); drawMap(); });
  $('map-zoom-out').addEventListener('click', () => { zoom = Math.max(8, zoom - 1); drawMap(); });
  $('map-center').addEventListener('click', () => { const position = state?.peers.find(peer => peer.clientId === clientId)?.position; center = position || { lat: 46.781, lng: 4.854 }; zoom = 14; drawMap(); });
  $('tactical-map').addEventListener('pointerdown', event => { if (event.target.closest('button,a') || event.button !== 0) return; dragging = { x: event.clientX, y: event.clientY, center: project(center) }; $('tactical-map').setPointerCapture(event.pointerId); });
  $('tactical-map').addEventListener('pointermove', event => { if (!dragging) return; center = unproject({ x: dragging.center.x - event.clientX + dragging.x, y: dragging.center.y - event.clientY + dragging.y }); scheduleMap(); });
  $('tactical-map').addEventListener('pointerup', () => { dragging = null; }); $('tactical-map').addEventListener('pointercancel', () => { dragging = null; });
  $('tactical-map').addEventListener('keydown', event => {
    const offset = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] }[event.key];
    if (offset) { event.preventDefault(); const current = project(center); center = unproject({ x: current.x + offset[0], y: current.y + offset[1] }); drawMap(); }
  });
  new ResizeObserver(scheduleMap).observe($('tactical-map'));
  function tick() { $('clock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' }); }
  tick(); setInterval(tick, 1000); document.body.dataset.view = 'console'; loadAppearance(); bootstrap();
})();
