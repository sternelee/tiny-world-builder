  // -------- PartyKit shared building --------
  (function wirePartyKitMultiplayer() {
    const params = new URLSearchParams(location.search);
    const rawRoom = params.get('party') || params.get('room') || params.get('collab') || '';
    const shareId = params.get('share') || '';
    const roomId = sanitizeMultiplayerId((rawRoom === '1' || rawRoom === 'true') ? shareId : rawRoom);
    if (!roomId) return;

    const MP_CLIENT_ID_LS = 'tinyworld:multiplayer:client-id';
    const MP_NAME_LS = 'tinyworld:multiplayer:name';
    const MP_HOST_LS = 'tinyworld:multiplayer:party-host';
    const peers = new Map();
    const peerRoot = new THREE.Group();
    peerRoot.name = 'multiplayer-peers';
    xrWorldRoot.add(peerRoot);
    let socket = null;
    let reconnectTimer = null;
    let reconnectDelay = 800;
    let connectAttempts = 0;
    let everConnected = false;
    let connected = false;
    let rosterEl = null;
    let statusEl = null;
    let serverClientId = '';
    let applyingRemote = false;
    let lastPresenceSent = 0;
    let presenceTimer = null;
    let lastPresenceKey = '';
    let lastHoverKey = '';

    // -------- lobby / roles / moderation state --------
    // SAFETY INVARIANT: default to ADMITTED. An un-upgraded server sends no
    // role/admitted fields, so the client must behave exactly as today (open,
    // full edit). Only an explicit admitted:false from the server gates us.
    let admitted = true;
    let isHost = false;
    let myRole = null;            // null => un-upgraded/host-equivalent full rights.
    let myIsland = null;          // editor scope bounds { minX, maxX, minZ, maxZ }.
    let declined = false;         // declined/kicked => stop reconnecting.
    // Host-only: per-peer role tracking. Non-host clients have no wire path to
    // learn other peers' roles (presence is role-free by protocol), so only the
    // host renders role badges + the moderation menu from this map.
    const roleById = new Map();
    let lobbyOverlayEl = null;
    let admitPanelEl = null;
    const pendingLobby = new Map();   // id -> { id, name }
    const toastedLobby = new Set();   // ids we've already toasted for
    let moderationMenuEl = null;

    function inIsland(island, x, z) {
      if (!island) return false;
      return x >= island.minX && x <= island.maxX && z >= island.minZ && z <= island.maxZ;
    }

    // Single source of truth for "may this client edit cell (x,z)?". Used by
    // both sendCellSnapshot (broadcast gate) and applyTool (local-mutation
    // gate, via window.__tinyworldMultiplayer). DENY-on-explicit-restriction:
    // null/host roles get full edit, so an un-upgraded server is unaffected.
    function canEdit(x, z) {
      if (!admitted) return false;
      if (myRole === 'viewer' || myRole === 'player') return false;
      if (myRole === 'editor') return inIsland(myIsland, Math.round(Number(x)), Math.round(Number(z)));
      return true;
    }

    // May this client interact with placed things (e.g. click a plane to fly)?
    // Player can; viewer cannot. Null/host/editor can.
    function canInteract() {
      if (!admitted) return false;
      if (myRole === 'viewer') return false;
      return true;
    }

    // True if this client may edit the world at all (host/editor/un-upgraded).
    // Gates keyboard/clipboard edit paths that are not per-cell.
    function canEditAny() {
      if (!admitted) return false;
      return myRole !== 'viewer' && myRole !== 'player';
    }

    const localClientId = (() => {
      try {
        const existing = localStorage.getItem(MP_CLIENT_ID_LS);
        if (existing) return existing;
        const next = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem(MP_CLIENT_ID_LS, next);
        return next;
      } catch (_) {
        return 'u_' + Math.random().toString(36).slice(2, 10);
      }
    })();

    // Stable per-page connection token. Passed as PartyKit's _pk so conn.id is
    // reused across WS reconnects (server re-admits a returning member from its
    // seat memory). Unique per tab (random suffix) so two tabs don't collide.
    const connToken = localClientId + '-' + Math.random().toString(36).slice(2, 8);

    function sanitizeMultiplayerId(value) {
      return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    }

    function hashNumber(text) {
      let h = 2166136261;
      const s = String(text || '');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function colorForId(id) {
      const hue = hashNumber(id) % 360;
      const c = new THREE.Color();
      c.setHSL(hue / 360, 0.72, 0.56);
      return '#' + c.getHexString();
    }

    function cssColorToHex(color) {
      const c = new THREE.Color(color || '#3c82f7');
      return c.getHex();
    }

    function multiplayerHost() {
      const explicit = params.get('partyHost')
        || window.__TINY_WORLD_PARTYKIT_HOST__
        || (() => { try { return localStorage.getItem(MP_HOST_LS); } catch (_) { return ''; } })();
      const host = String(explicit || '').trim().replace(/\/+$/, '');
      if (host) return host.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'ws://localhost:1999';
      // Deployed PartyKit room server — separate infra from the Netlify static
      // site. The previous `wss://' + location.host` default could never work:
      // the static host has no WebSocket server, so collab silently looped
      // "reconnecting" in production. Override via ?partyHost or
      // window.__TINY_WORLD_PARTYKIT_HOST__ / localStorage for other deploys.
      return 'wss://tinyworld-shared-building.jasonkneen.partykit.dev';
    }

    function multiplayerSocketUrl() {
      // _pk sets the PartyKit conn id; the stable per-page token lets the server
      // recognize this client across WS reconnects (seats re-admit, no re-lobby).
      return multiplayerHost() + '/party/' + encodeURIComponent(roomId) + '?_pk=' + encodeURIComponent(connToken);
    }

    function localName() {
      try {
        const stored = localStorage.getItem(MP_NAME_LS);
        if (stored) return stored.slice(0, 48);
      } catch (_) {}
      if (window.TinyWorldAuth && window.__loggedIn) return 'Builder';
      return 'Guest ' + localClientId.slice(-4).toUpperCase();
    }

    function ensureStatus() {
      if (statusEl) return statusEl;
      statusEl = document.createElement('div');
      statusEl.className = 'multiplayer-status';
      statusEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(statusEl);
      return statusEl;
    }

    function setStatus(state, text) {
      const el = ensureStatus();
      el.dataset.state = state;
      el.textContent = text;
    }

    function sendMessage(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (_) {
        return false;
      }
    }

    function localSelection() {
      const api = window.__tinyworldSelection;
      if (!api || typeof api.worldCoords !== 'function') return [];
      try {
        return api.worldCoords().slice(0, 64).map(c => ({ x: Math.round(c.x), z: Math.round(c.z) }));
      } catch (_) {
        return [];
      }
    }

    function localCursor() {
      if (!currentHover) return null;
      const x = Math.round(currentHover.x + (currentHover.boardX || 0) * GRID);
      const z = Math.round(currentHover.z + (currentHover.boardZ || 0) * GRID);
      let y = 0.05;
      try { y = hoverHeightForCell(currentHover) + 0.03; } catch (_) {}
      return { x, z, y };
    }

    function localToolLabel() {
      if (!selectedTool) return '';
      return selectedTool.label || selectedTool.id || selectedTool.kind || selectedTool.terrain || '';
    }

    function localPresence() {
      return {
        id: serverClientId || localClientId,
        name: localName(),
        color: colorForId(localClientId),
        cursor: localCursor(),
        selection: localSelection(),
        tool: localToolLabel(),
        ts: Date.now(),
      };
    }

    function schedulePresence(force = false) {
      if (presenceTimer) return;
      const wait = force ? 0 : Math.max(0, 90 - (Date.now() - lastPresenceSent));
      presenceTimer = setTimeout(() => {
        presenceTimer = null;
        publishPresence(force);
      }, wait);
    }

    function publishPresence(force = false) {
      const presence = localPresence();
      const key = JSON.stringify({
        cursor: presence.cursor,
        selection: presence.selection,
        tool: presence.tool,
      });
      if (!force && key === lastPresenceKey) return;
      lastPresenceKey = key;
      lastPresenceSent = Date.now();
      sendMessage({ type: 'presence', presence });
    }

    // -------- connected-user roster (top-center pill) --------
    function avatarInitials(name) {
      const t = String(name || '').trim();
      if (!t) return '?';
      const parts = t.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return t.slice(0, 2).toUpperCase();
    }

    function ensureRoster() {
      if (rosterEl) return rosterEl;
      rosterEl = document.createElement('div');
      rosterEl.className = 'multiplayer-roster';
      rosterEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(rosterEl);
      return rosterEl;
    }

    // Inline SVG glyphs (no emoji, no PNG). Returns an <svg> element.
    function svgGlyph(kind) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('aria-hidden', 'true');
      const paths = {
        // eye (viewer)
        viewer: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
        // pencil (editor)
        editor: ['M4 20h4l10-10-4-4L4 16v4z M14 6l4 4'],
        // play (player)
        player: ['M8 5l11 7-11 7z'],
        // crown (host)
        host: ['M4 18h16l-1.5-9-4 4-2.5-7-2.5 7-4-4z'],
        // check (admit)
        check: ['M5 13l4 4 10-10'],
        // x (decline / close)
        close: ['M6 6l12 12 M18 6L6 18'],
        // gear / dots (menu)
        menu: ['M5 12h.01 M12 12h.01 M19 12h.01'],
      };
      (paths[kind] || []).forEach(d => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
      });
      return svg;
    }

    function roleLabel(role) {
      if (role === 'host') return 'Host';
      if (role === 'editor') return 'Editor';
      if (role === 'player') return 'Player';
      if (role === 'viewer') return 'Viewer';
      return '';
    }

    // Brief glassy toast bottom-center. textContent only (remote names).
    function showToast(text) {
      const t = document.createElement('div');
      t.className = 'mp-toast';
      t.textContent = String(text || '');
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('visible'));
      setTimeout(() => {
        t.classList.remove('visible');
        setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
      }, 3200);
    }

    // Render is textContent-only (peer names are remote-controlled, so never
    // innerHTML) and colors are validated before hitting style. The host sees a
    // role badge + a moderation menu per peer; non-host clients see only their
    // own badge (no wire path to learn other peers' roles — see roleById note).
    function renderRoster() {
      const el = ensureRoster();
      el.textContent = '';
      if (!connected || !admitted) { el.classList.remove('visible'); return; }
      const meId = serverClientId || localClientId;
      const people = [{ id: meId, name: localName(), color: colorForId(localClientId), self: true, role: myRole }];
      peers.forEach((peer, id) => {
        if (id === meId) return;
        people.push({
          id,
          name: (peer.presence && peer.presence.name) || 'Builder',
          color: peer.color,
          role: isHost ? (roleById.get(id) || null) : null,
        });
      });
      const count = document.createElement('span');
      count.className = 'mp-count';
      count.textContent = String(people.length);
      count.title = people.length + (people.length === 1 ? ' person here' : ' people here');
      el.appendChild(count);
      const avatars = document.createElement('span');
      avatars.className = 'mp-avatars';
      const MAX_SHOWN = 8;
      people.slice(0, MAX_SHOWN).forEach((p) => {
        const a = document.createElement('span');
        a.className = 'mp-avatar' + (p.self ? ' mp-self' : '');
        a.style.background = /^#[0-9a-fA-F]{3,8}$/.test(String(p.color)) ? p.color : '#3c82f7';
        a.textContent = avatarInitials(p.name);
        const roleSuffix = p.role ? ' — ' + roleLabel(p.role) : '';
        a.title = (p.self ? p.name + ' (you)' : p.name) + roleSuffix;
        if (p.role) {
          const badge = document.createElement('span');
          badge.className = 'mp-role-badge mp-role-' + p.role;
          badge.appendChild(svgGlyph(p.role));
          a.appendChild(badge);
        }
        // Host can click any non-self peer to open a moderation menu.
        if (isHost && !p.self) {
          a.classList.add('mp-clickable');
          a.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openModerationMenu(p.id, p.name, a);
          });
        }
        avatars.appendChild(a);
      });
      const overflow = people.length - Math.min(people.length, MAX_SHOWN);
      if (overflow > 0) {
        const m = document.createElement('span');
        m.className = 'mp-avatar mp-more';
        m.textContent = '+' + overflow;
        m.title = overflow + ' more';
        avatars.appendChild(m);
      }
      el.appendChild(avatars);
      el.classList.add('visible');
    }

    // MVP editor grant = the host's home board: world x,z in [0, GRID-1].
    // TODO: per-editable-island granularity (grant the bounds of the specific
    // island the host has selected, derived from boardX/boardZ * GRID).
    function homeIslandBounds() {
      const g = (typeof GRID === 'number' && GRID > 0) ? GRID : 16;
      return { minX: 0, maxX: g - 1, minZ: 0, maxZ: g - 1 };
    }

    // Segmented role picker (Viewer / Editor / Player) in the app style.
    // Returns { el, value() }. Default selection = 'viewer'.
    function makeRolePicker(initial) {
      const seg = document.createElement('div');
      seg.className = 'mp-segmented';
      let value = initial && /^(viewer|editor|player)$/.test(initial) ? initial : 'viewer';
      const options = [
        { id: 'viewer', label: 'Viewer' },
        { id: 'editor', label: 'Editor' },
        { id: 'player', label: 'Player' },
      ];
      const buttons = new Map();
      options.forEach(opt => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mp-seg-btn' + (opt.id === value ? ' is-active' : '');
        b.appendChild(svgGlyph(opt.id));
        const span = document.createElement('span');
        span.textContent = opt.label;
        b.appendChild(span);
        b.addEventListener('click', () => {
          value = opt.id;
          buttons.forEach((btn, id) => btn.classList.toggle('is-active', id === value));
        });
        buttons.set(opt.id, b);
        seg.appendChild(b);
      });
      return { el: seg, value: () => value };
    }

    // -------- lobby-wait overlay (shown to an un-admitted self) --------
    function showLobbyOverlay(show) {
      if (show) {
        if (!lobbyOverlayEl) {
          lobbyOverlayEl = document.createElement('div');
          lobbyOverlayEl.className = 'mp-lobby-overlay';
          const card = document.createElement('div');
          card.className = 'mp-lobby-card';
          const title = document.createElement('div');
          title.className = 'mp-lobby-title';
          title.textContent = 'Waiting for the host to let you in...';
          const sub = document.createElement('div');
          sub.className = 'mp-lobby-sub';
          sub.textContent = 'You will join the shared build as soon as the host admits you.';
          card.appendChild(title);
          card.appendChild(sub);
          lobbyOverlayEl.appendChild(card);
          document.body.appendChild(lobbyOverlayEl);
        }
        lobbyOverlayEl.classList.add('visible');
      } else if (lobbyOverlayEl) {
        lobbyOverlayEl.classList.remove('visible');
      }
    }

    // Show a brief, terminal notice (declined / kicked); stops reconnecting.
    function showLobbyNotice(text) {
      showLobbyOverlay(true);
      if (!lobbyOverlayEl) return;
      const card = lobbyOverlayEl.querySelector('.mp-lobby-card');
      if (!card) return;
      card.textContent = '';
      const title = document.createElement('div');
      title.className = 'mp-lobby-title';
      title.textContent = text;
      card.appendChild(title);
    }

    // -------- host admit panel (lists pending lobby members) --------
    function ensureAdmitPanel() {
      if (admitPanelEl) return admitPanelEl;
      admitPanelEl = document.createElement('div');
      admitPanelEl.className = 'mp-admit-panel';
      const head = document.createElement('div');
      head.className = 'mp-admit-head';
      const heading = document.createElement('span');
      heading.className = 'mp-admit-title';
      heading.textContent = 'Lobby';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'mp-admit-close';
      close.setAttribute('aria-label', 'Hide lobby');
      close.appendChild(svgGlyph('close'));
      close.addEventListener('click', () => { admitPanelEl.classList.remove('visible'); });
      head.appendChild(heading);
      head.appendChild(close);
      const list = document.createElement('div');
      list.className = 'mp-admit-list';
      admitPanelEl.appendChild(head);
      admitPanelEl.appendChild(list);
      document.body.appendChild(admitPanelEl);
      return admitPanelEl;
    }

    // Upsert the panel rows from pendingLobby (keyed by id — no duplicates).
    function renderAdmitPanel() {
      if (!isHost) { if (admitPanelEl) admitPanelEl.classList.remove('visible'); return; }
      const panel = ensureAdmitPanel();
      const list = panel.querySelector('.mp-admit-list');
      list.textContent = '';
      if (pendingLobby.size === 0) {
        panel.classList.remove('visible');
        return;
      }
      pendingLobby.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'mp-admit-row';
        const av = document.createElement('span');
        av.className = 'mp-avatar';
        av.style.background = colorForId(entry.id);
        av.textContent = avatarInitials(entry.name || 'Guest');
        const nameEl = document.createElement('span');
        nameEl.className = 'mp-admit-name';
        nameEl.textContent = entry.name || 'Guest';
        const picker = makeRolePicker('viewer');
        const actions = document.createElement('div');
        actions.className = 'mp-admit-actions';
        const admitBtn = document.createElement('button');
        admitBtn.type = 'button';
        admitBtn.className = 'mp-btn mp-btn-admit';
        admitBtn.appendChild(svgGlyph('check'));
        const admitLabel = document.createElement('span');
        admitLabel.textContent = 'Admit';
        admitBtn.appendChild(admitLabel);
        admitBtn.addEventListener('click', () => {
          const role = picker.value();
          const island = role === 'editor' ? homeIslandBounds() : null;
          sendMessage({ type: 'admit', id: entry.id, role, island });
          roleById.set(entry.id, role);
          pendingLobby.delete(entry.id);
          renderAdmitPanel();
        });
        const declineBtn = document.createElement('button');
        declineBtn.type = 'button';
        declineBtn.className = 'mp-btn mp-btn-decline';
        declineBtn.appendChild(svgGlyph('close'));
        const declineLabel = document.createElement('span');
        declineLabel.textContent = 'Decline';
        declineBtn.appendChild(declineLabel);
        declineBtn.addEventListener('click', () => {
          sendMessage({ type: 'decline', id: entry.id });
          pendingLobby.delete(entry.id);
          renderAdmitPanel();
        });
        actions.appendChild(admitBtn);
        actions.appendChild(declineBtn);
        const top = document.createElement('div');
        top.className = 'mp-admit-rowtop';
        top.appendChild(av);
        top.appendChild(nameEl);
        row.appendChild(top);
        row.appendChild(picker.el);
        row.appendChild(actions);
        list.appendChild(row);
      });
      panel.classList.add('visible');
    }

    // -------- host moderation menu (change role / kick a peer) --------
    function closeModerationMenu() {
      if (moderationMenuEl && moderationMenuEl.parentNode) moderationMenuEl.parentNode.removeChild(moderationMenuEl);
      moderationMenuEl = null;
    }

    function openModerationMenu(id, name, anchorEl) {
      closeModerationMenu();
      const menu = document.createElement('div');
      menu.className = 'mp-mod-menu';
      const title = document.createElement('div');
      title.className = 'mp-mod-title';
      title.textContent = name || 'Builder';
      menu.appendChild(title);
      const picker = makeRolePicker(roleById.get(id) || 'viewer');
      menu.appendChild(picker.el);
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'mp-btn mp-btn-admit';
      const applyLabel = document.createElement('span');
      applyLabel.textContent = 'Change role';
      apply.appendChild(applyLabel);
      apply.addEventListener('click', () => {
        const role = picker.value();
        const island = role === 'editor' ? homeIslandBounds() : null;
        sendMessage({ type: 'setRole', id, role, island });
        roleById.set(id, role);
        closeModerationMenu();
        renderRoster();
      });
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'mp-btn mp-btn-decline';
      const kickLabel = document.createElement('span');
      kickLabel.textContent = 'Kick';
      kick.appendChild(kickLabel);
      kick.addEventListener('click', () => {
        sendMessage({ type: 'kick', id });
        roleById.delete(id);
        closeModerationMenu();
      });
      menu.appendChild(apply);
      menu.appendChild(kick);
      const rect = anchorEl.getBoundingClientRect();
      menu.style.top = (rect.bottom + 8) + 'px';
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 220)) + 'px';
      document.body.appendChild(menu);
      moderationMenuEl = menu;
      // Dismiss on outside click.
      setTimeout(() => {
        const onDoc = (ev) => {
          if (moderationMenuEl && !moderationMenuEl.contains(ev.target)) {
            closeModerationMenu();
            document.removeEventListener('pointerdown', onDoc, true);
          }
        };
        document.addEventListener('pointerdown', onDoc, true);
      }, 0);
    }

    function makeNameSprite(name, color) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      const label = String(name || 'Builder').slice(0, 28);
      const width = Math.min(230, Math.max(72, ctx.measureText(label).width + 28));
      ctx.fillStyle = 'rgba(24, 28, 38, 0.84)';
      roundRect(ctx, (256 - width) / 2, 12, width, 36, 12);
      ctx.fill();
      ctx.fillStyle = color || '#3c82f7';
      ctx.beginPath();
      ctx.arc((256 - width) / 2 + 18, 30, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, 31);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.55, 0.38, 1);
      sprite.renderOrder = 1500;
      return sprite;
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }

    function ensurePeer(id, presence) {
      let peer = peers.get(id);
      if (peer) return peer;
      const color = presence.color || colorForId(id);
      const group = new THREE.Group();
      group.name = 'multiplayer-peer-' + id;
      const ringMat = new THREE.MeshBasicMaterial({
        color: cssColorToHex(color),
        transparent: true,
        opacity: 0.92,
        depthTest: false,
      });
      // Square cell-footprint outline (not a circle) so the peer marker lines up
      // with the grid like the selection square does.
      const sqOuter = new THREE.Shape();
      sqOuter.moveTo(-0.5, -0.5); sqOuter.lineTo(0.5, -0.5); sqOuter.lineTo(0.5, 0.5); sqOuter.lineTo(-0.5, 0.5); sqOuter.lineTo(-0.5, -0.5);
      const sqHole = new THREE.Path();
      sqHole.moveTo(-0.4, -0.4); sqHole.lineTo(-0.4, 0.4); sqHole.lineTo(0.4, 0.4); sqHole.lineTo(0.4, -0.4); sqHole.lineTo(-0.4, -0.4);
      sqOuter.holes.push(sqHole);
      const ring = new THREE.Mesh(new THREE.ShapeGeometry(sqOuter), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 1400;
      group.add(ring);
      const beacon = new THREE.Mesh(
        new THREE.ConeGeometry(0.13, 0.34, 18),
        new THREE.MeshBasicMaterial({ color: cssColorToHex(color), transparent: true, opacity: 0.86, depthTest: false })
      );
      beacon.position.y = 0.34;
      beacon.renderOrder = 1401;
      group.add(beacon);
      const label = makeNameSprite(presence.name, color);
      label.position.y = 0.86;
      group.add(label);
      const selection = new THREE.Group();
      selection.name = 'multiplayer-selection-' + id;
      group.add(selection);
      peerRoot.add(group);
      peer = { id, group, ring, beacon, label, selection, presence: null, color };
      peers.set(id, peer);
      return peer;
    }

    function disposeObject3d(obj) {
      if (!obj) return;
      obj.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(mat => {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          });
        }
      });
    }

    function removePeer(id) {
      const peer = peers.get(id);
      if (!peer) return;
      peerRoot.remove(peer.group);
      disposeObject3d(peer.group);
      peers.delete(id);
      renderRoster();
    }

    function clearGroup(group) {
      while (group.children.length) {
        const child = group.children.pop();
        disposeObject3d(child);
      }
    }

    function cellY(x, z) {
      try { return hoverHeightForCell({ x, z, boardX: 0, boardZ: 0 }) + 0.012; } catch (_) { return 0.04; }
    }

    function updatePeerSelection(peer, selection) {
      clearGroup(peer.selection);
      const cells = Array.isArray(selection) ? selection.slice(0, 64) : [];
      if (!cells.length) return;
      const color = cssColorToHex(peer.color);
      const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, depthTest: false });
      const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false, depthTest: false });
      cells.forEach(cell => {
        const x = Math.round(Number(cell.x));
        const z = Math.round(Number(cell.z));
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const p = tilePos(x, z);
        const y = cellY(x, z);
        const fill = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.018, 0.92), fillMat);
        fill.position.set(p.x, y, p.z);
        fill.renderOrder = 1390;
        peer.selection.add(fill);
        const edgeN = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.025, 0.045), edgeMat);
        const edgeS = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.025, 0.045), edgeMat);
        const edgeW = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.96), edgeMat);
        const edgeE = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.96), edgeMat);
        edgeN.position.set(p.x, y + 0.018, p.z - 0.48);
        edgeS.position.set(p.x, y + 0.018, p.z + 0.48);
        edgeW.position.set(p.x - 0.48, y + 0.018, p.z);
        edgeE.position.set(p.x + 0.48, y + 0.018, p.z);
        [edgeN, edgeS, edgeW, edgeE].forEach(edge => { edge.renderOrder = 1391; peer.selection.add(edge); });
      });
    }

    function updatePeerPresence(presence) {
      if (!presence || !presence.id || presence.id === serverClientId) return;
      const peer = ensurePeer(presence.id, presence);
      peer.presence = presence;
      if (presence.color && presence.color !== peer.color) peer.color = presence.color;
      if (presence.cursor) {
        const p = tilePos(Math.round(Number(presence.cursor.x)), Math.round(Number(presence.cursor.z)));
        const y = Number.isFinite(Number(presence.cursor.y)) ? Number(presence.cursor.y) : cellY(presence.cursor.x, presence.cursor.z);
        peer.group.position.set(p.x, y + 0.015, p.z);
        peer.group.visible = true;
      } else {
        peer.group.visible = false;
      }
      updatePeerSelection(peer, presence.selection);
      renderRoster();
    }

    function cleanCellForSend(cell) {
      if (!cell || typeof cell !== 'object') return null;
      try { return JSON.parse(JSON.stringify(cell)); } catch (_) { return null; }
    }

    function sendCellSnapshot(x, z, cell) {
      // Gate on suppressSave too: it brackets the entire async bulk-apply
      // window (set before buildOneChunk, cleared in finishApplyState), so a
      // snapshot load no longer floods the room over peers' live edits.
      // Interactive single-click edits never set suppressSave, so they still
      // flow. suppressSave is a shared global declared at 29-persistence-api.js:9.
      if (applyingRemote || (typeof suppressSave !== 'undefined' && suppressSave) || !cell) return;
      // Role gate: viewers/players never broadcast; an editor only within its
      // granted island bounds. canEdit is the single source of truth shared
      // with applyTool. Un-upgraded server => myRole null => always permitted.
      if (!canEdit(x, z)) return;
      const copy = cleanCellForSend(cell);
      if (!copy) return;
      sendMessage({
        type: 'cell.set',
        op: {
          id: localClientId + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 6),
          kind: 'cell.set',
          x: Math.round(Number(x)),
          z: Math.round(Number(z)),
          cell: copy,
          ts: Date.now(),
        },
      });
    }

    function applyRemoteCell(op) {
      if (!op || !op.cell) return;
      if (!admitted) return;
      const x = Math.round(Number(op.x));
      const z = Math.round(Number(op.z));
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      // Defense-in-depth: mirror the server's coordinate range check (party
      // index.js MAX_CELL_COORD) so a malicious/buggy server can't grow
      // world[x][z] without bound. Generous cap keeps sparse ghost-board cells.
      const maxRemoteCoord = 100000;
      if (Math.abs(x) > maxRemoteCoord || Math.abs(z) > maxRemoteCoord) return;
      applyingRemote = true;
      const oldHistoryMuted = typeof worldHistoryMuted !== 'undefined' ? worldHistoryMuted : false;
      try {
        if (typeof worldHistoryMuted !== 'undefined') worldHistoryMuted = true;
        setCell(x, z, Object.assign({}, op.cell, {
          animate: false,
          impactDust: false,
          forceTile: true,
        }));
      } catch (err) {
        console.warn('[multiplayer] remote cell failed:', err);
      } finally {
        if (typeof worldHistoryMuted !== 'undefined') worldHistoryMuted = oldHistoryMuted;
        applyingRemote = false;
      }
    }

    // Apply a granted role/island/admitted state to local self-state, then
    // refresh dependent UI. Called from welcome / admitted / role.
    function applySelfState(role, island, isAdmitted) {
      if (typeof role === 'string') {
        myRole = role;
        isHost = role === 'host';
      }
      myIsland = island && typeof island === 'object' ? island : (myRole === 'editor' ? myIsland : null);
      admitted = isAdmitted;
      showLobbyOverlay(!admitted);
      if (admitted) {
        publishPresence(true);
        renderRoster();
      }
      renderAdmitPanel();
    }

    function ingestPending(list) {
      if (!Array.isArray(list)) return;
      list.forEach(p => {
        if (!p || !p.id) return;
        pendingLobby.set(p.id, { id: p.id, name: String(p.name || '') });
      });
      renderAdmitPanel();
    }

    function handleMessage(event) {
      let data = null;
      try { data = JSON.parse(String(event.data || '')); } catch (_) { return; }
      if (!data || !data.type) return;
      if (data.type === 'welcome') {
        serverClientId = data.id || serverClientId;
        // SAFETY INVARIANT: default to admitted. Only an explicit admitted:false
        // puts us in the lobby-wait state. An un-upgraded server omits these
        // fields => admitted stays true, myRole stays null => behaves as today.
        admitted = (data.admitted !== false);
        if (typeof data.role === 'string') { myRole = data.role; isHost = data.role === 'host'; }
        showLobbyOverlay(!admitted);
        (Array.isArray(data.peers) ? data.peers : []).forEach(updatePeerPresence);
        // Lobby clients still publish presence so the host learns their name.
        publishPresence(true);
        if (admitted) renderRoster();
        renderAdmitPanel();
      } else if (data.type === 'lobby.join') {
        if (!data.id) return;
        const name = String(data.name || '');
        const isNew = !toastedLobby.has(data.id);
        pendingLobby.set(data.id, { id: data.id, name });
        if (isNew && name) {
          toastedLobby.add(data.id);
          showToast(name + ' has entered the lobby');
        }
        renderAdmitPanel();
      } else if (data.type === 'lobby.leave') {
        if (!data.id) return;
        pendingLobby.delete(data.id);
        toastedLobby.delete(data.id);
        renderAdmitPanel();
      } else if (data.type === 'lobby.list') {
        ingestPending(data.pending);
      } else if (data.type === 'admitted') {
        applySelfState(data.role, data.island || null, true);
        (Array.isArray(data.peers) ? data.peers : []).forEach(updatePeerPresence);
      } else if (data.type === 'declined') {
        declined = true;
        admitted = false;
        showLobbyNotice('The host declined your request to join.');
      } else if (data.type === 'kicked') {
        declined = true;
        admitted = false;
        showLobbyNotice('You have been removed from the shared build.');
      } else if (data.type === 'role') {
        // An admitted peer's role changed, or we were promoted to host. There
        // is no id field by protocol => this is always about US.
        const wasAdmitted = admitted;
        applySelfState(data.role, data.island || null, data.admitted !== false);
        if (data.role === 'host' && Array.isArray(data.pending)) ingestPending(data.pending);
        if (!wasAdmitted && admitted) showToast('You are now ' + (roleLabel(myRole) || 'admitted'));
      } else if (data.type === 'presence') {
        updatePeerPresence(data.presence);
      } else if (data.type === 'leave') {
        removePeer(data.id);
        roleById.delete(data.id);
      } else if (data.type === 'cell.set') {
        applyRemoteCell(data.op);
      }
    }

    function connect() {
      if (declined) return;
      clearTimeout(reconnectTimer);
      setStatus('connecting', 'Shared room: connecting');
      try {
        socket = new WebSocket(multiplayerSocketUrl());
      } catch (err) {
        setStatus('offline', 'Shared room: offline');
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(8000, reconnectDelay * 1.5);
        return;
      }
      socket.addEventListener('open', () => {
        reconnectDelay = 800;
        connectAttempts = 0;
        everConnected = true;
        connected = true;
        setStatus('online', 'Shared room: ' + roomId);
        publishPresence(true);
        renderRoster();
      });
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', () => {
        connected = false;
        peers.forEach((_, id) => removePeer(id));
        // Declined or kicked: terminal. Do not reconnect; leave the notice up.
        if (declined) {
          setStatus('offline', 'Shared room: closed');
          return;
        }
        connectAttempts++;
        // Never opened a single connection after several tries => the host is
        // almost certainly misconfigured or down, not a transient blip. Say so
        // plainly instead of an endless, misleading "reconnecting". Keep retrying
        // (capped) so it still self-heals if the server comes back.
        const unreachable = !everConnected && connectAttempts >= 4;
        setStatus('offline', unreachable ? 'Shared building unavailable' : 'Shared room: reconnecting');
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(8000, reconnectDelay * 1.5);
      });
      socket.addEventListener('error', () => {
        setStatus('offline', 'Shared room: offline');
      });
    }

    window.addEventListener('tinyworld:world-changed', e => {
      const d = e && e.detail;
      if (!d || !Number.isFinite(Number(d.x)) || !Number.isFinite(Number(d.z))) return;
      sendCellSnapshot(d.x, d.z, d.cell);
    });
    window.addEventListener('tinyworld:selection-changed', () => schedulePresence(true));
    renderer.domElement.addEventListener('pointermove', () => {
      const c = localCursor();
      const key = c ? c.x + ',' + c.z : '';
      if (key !== lastHoverKey) {
        lastHoverKey = key;
        schedulePresence(false);
      }
    }, { passive: true });
    renderer.domElement.addEventListener('pointerleave', () => schedulePresence(true), { passive: true });
    setInterval(() => schedulePresence(true), 2500);

    window.__tinyworldMultiplayer = {
      roomId,
      connect,
      presence: localPresence,
      peers: () => Array.from(peers.keys()),
      url: multiplayerSocketUrl,
      // Role gates consumed by the input layer (20-input-place-erase.js) so
      // viewer/player local mutations are blocked before they desync the view,
      // and an editor's edits are confined to the granted island bounds.
      canEdit,
      canInteract,
      canEditAny,
      role: () => myRole,
    };

    connect();
  })();
