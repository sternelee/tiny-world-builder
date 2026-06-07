  // Worlds MMO — in-world HUD: hearts/energy, resource tallies, and the four harvest
  // actions (fish/mine/gather/hunt) with cooldowns. Chat REUSES the existing chat
  // panel component (the mp-chat-* markup/styles from 38-multiplayer-partykit.js)
  // rather than a second chat UI — it's just driven by the world room socket.
  // Subscribes to the room client's events (47) and calls its harvest/sendChat/
  // leaveRoom API. IIFE-wrapped; no globals leak.
  (function wireWorldsHud() {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
  
    const WS = (window.__tinyworldWorlds = window.__tinyworldWorlds || {});
    function T(k, p) { return typeof window.t === 'function' ? window.t(k, p) : k; }
    function on(ev, cb) { if (typeof WS.on === 'function') WS.on(ev, cb); }
  
    function el(tag, attrs, kids) {
      const n = document.createElement(tag);
      if (attrs) for (const k of Object.keys(attrs)) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
        else n.setAttribute(k, attrs[k]);
      }
      if (kids) for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      return n;
    }
  
    function injectStyles() {
      if (document.getElementById('tw-worlds-hud-style')) return;
      const css = `
  .tw-hud{position:fixed;left:50%;bottom:calc(14px + var(--tw-worlds-bottom-inset,0px));transform:translateX(-50%);z-index:66;display:none;
    align-items:center;gap:12px;background:#0c1424e6;border:1px solid rgba(255,255,255,.18);
    border-radius:14px;padding:10px 14px;color:#eef3ff;font-family:system-ui}
  .tw-hud.open{display:flex}
  .tw-hud .grp{display:flex;align-items:center;gap:6px;font:600 13px system-ui}
  .tw-hud .hearts{letter-spacing:1px;color:#ff6b81;font-size:14px}
  .tw-hud .res span{margin-right:8px}
  .tw-hud .act{border:0;border-radius:9px;padding:9px 12px;cursor:pointer;font:600 12px system-ui;color:#fff;background:#2b59d6}
  .tw-hud .act:disabled{opacity:.4;cursor:not-allowed}
  .tw-hud .leave{background:rgba(255,255,255,.12)}
  .tw-hud .role{font:600 11px system-ui;text-transform:uppercase;letter-spacing:.05em;opacity:.7}
  `;
      document.head.appendChild(el('style', { id: 'tw-worlds-hud-style', text: css }));
    }
  
    let hud = null, heartsEl = null, resEl = null, roleEl = null;
    const actBtns = {};
    const cooldowns = {};   // action -> timestamp until enabled
  
    function buildHud() {
      if (hud) return;
      injectStyles();
      heartsEl = el('span', { class: 'hearts' });
      resEl = el('span', { class: 'res' });
      roleEl = el('span', { class: 'role' });
      const actGrp = el('div', { class: 'grp' });
      [['fish', 'worlds.actionFish', '🐟'], ['mine', 'worlds.actionMine', '⛏'], ['gather', 'worlds.actionGather', '🌿'], ['hunt', 'worlds.actionHunt', '🥩']]
        .forEach(([action, key, icon]) => {
          const b = el('button', { class: 'act', text: icon + ' ' + T(key), onclick: () => { if (typeof WS.harvest === 'function') WS.harvest(action); } });
          actBtns[action] = b; actGrp.appendChild(b);
        });
      hud = el('div', { class: 'tw-hud' }, [
        el('div', { class: 'grp' }, [el('span', { text: '❤' }), heartsEl]),
        el('div', { class: 'grp' }, [resEl]),
        actGrp,
        roleEl,
        el('button', { class: 'act leave', text: T('worlds.leave'), onclick: () => { if (typeof WS.leaveRoom === 'function') WS.leaveRoom(); } }),
      ]);
      document.body.appendChild(hud);
    }
  
    // ---- chat: reuse the existing mp-chat panel component ----
    let chatToggle = null, chatPanel = null, chatLog = null, chatInput = null, chatOpen = false, chatUnread = 0, chatBadge = null;
  
    function buildChat() {
      if (chatPanel) return;
      chatBadge = el('span', { class: 'mp-chat-badge', style: 'position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#e6483d;color:#fff;font:700 10px system-ui;display:none;align-items:center;justify-content:center;padding:0 4px' });
      chatToggle = el('button', { class: 'mp-chat-toggle', type: 'button', title: T('worlds.chat'), style: 'position:fixed', onclick: () => setChatOpen(!chatOpen) }, ['💬', chatBadge]);
      const head = el('div', { class: 'mp-chat-head' }, [
        el('button', { class: 'mp-chat-close', type: 'button', 'aria-label': T('worlds.close'), onclick: () => setChatOpen(false) }, ['×']),
      ]);
      chatLog = el('div', { class: 'mp-chat-log', 'aria-live': 'polite' });
      chatInput = el('input', { type: 'text', class: 'mp-chat-input', maxlength: '280', placeholder: T('worlds.chat') + '…', autocomplete: 'off' });
      const form = el('form', { class: 'mp-chat-form' }, [chatInput, el('button', { type: 'submit', class: 'mp-chat-send', 'aria-label': T('worlds.send') }, ['➤'])]);
      form.addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
      chatPanel = el('div', { class: 'mp-chat-panel' }, [head, chatLog, form]);
      document.body.appendChild(chatToggle);
      document.body.appendChild(chatPanel);
    }
  
    function setChatOpen(open) {
      if (!chatPanel) return;
      chatOpen = !!open;
      chatPanel.classList.toggle('visible', chatOpen);
      if (chatToggle) chatToggle.classList.toggle('is-open', chatOpen);
      if (chatOpen) { chatUnread = 0; updateBadge(); if (chatInput) chatInput.focus(); chatLog.scrollTop = chatLog.scrollHeight; }
    }
    function updateBadge() { if (chatBadge) { chatBadge.textContent = chatUnread > 0 ? String(chatUnread) : ''; chatBadge.style.display = chatUnread > 0 ? 'flex' : 'none'; } }
    function sendChat() { const v = chatInput.value.trim(); if (v && typeof WS.sendChat === 'function') { WS.sendChat(v); chatInput.value = ''; } }
    function fmtTime(ts) { try { return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  
    function appendChat(d) {
      buildChat();
      const row = el('div', { class: 'mp-chat-msg' }, [
        el('div', { class: 'mp-chat-meta' }, [
          el('span', { class: 'mp-chat-name', text: String(d.name || 'Player') }),
          el('span', { class: 'mp-chat-time', text: fmtTime(d.ts) }),
        ]),
        el('div', { class: 'mp-chat-text', text: String(d.text || '') }),
      ]);
      chatLog.appendChild(row);
      while (chatLog.children.length > 250) chatLog.removeChild(chatLog.firstChild);
      chatLog.scrollTop = chatLog.scrollHeight;
      if (!chatOpen) { chatUnread++; updateBadge(); }
    }
  
    function renderHearts(n) {
      const max = 10; const filled = Math.max(0, Math.min(max, Math.round(n || 0)));
      heartsEl.textContent = '×' + filled + ' ' + '♥'.repeat(filled) + '♡'.repeat(max - filled);
    }
    function renderResources(r) {
      r = r || (typeof WS.getResources === 'function' ? WS.getResources() : {});
      resEl.textContent = '';
      [['🐟', r.fish], ['🥩', r.meat], ['🌿', r.plants], ['⛏', r.ore]].forEach(([icon, v]) => {
        resEl.appendChild(el('span', { text: icon + ' ' + (v || 0) }));
      });
    }
    function setRole(role) {
      roleEl.textContent = role === 'play' ? '' : T('worlds.observing');
      const playable = role === 'play';
      for (const a of Object.keys(actBtns)) actBtns[a].disabled = !playable;
    }
  
    function disableDuring(ms, only) {
      const until = Date.now() + ms;
      const targets = only ? [only] : Object.keys(actBtns);
      for (const a of targets) { cooldowns[a] = until; actBtns[a].disabled = true; }
      setTimeout(refreshCooldowns, ms + 30);
    }
    function refreshCooldowns() {
      const now = Date.now();
      for (const a of Object.keys(actBtns)) {
        if ((cooldowns[a] || 0) <= now) {
          const playable = (WS.getState && WS.getState().role) === 'play';
          actBtns[a].disabled = !playable;
        }
      }
    }
  
    function show() { buildHud(); buildChat(); hud.classList.add('open'); if (chatToggle) chatToggle.style.display = ''; renderResources(); }
    function hide() { if (hud) hud.classList.remove('open'); setChatOpen(false); if (chatToggle) chatToggle.style.display = 'none'; }
  
    on('enter', () => { show(); });
    on('leave', () => { hide(); });
    on('status', (d) => { if (d && d.role) setRole(d.role); });
    on('state', (s) => { buildHud(); if (s) { renderHearts(s.you && s.you.hearts); setRole(s.role); } renderResources(); });
    on('you', (y) => { if (y) renderHearts(y.hearts); });
    on('resources', (r) => renderResources(r));
    on('progress', (d) => { buildHud(); disableDuring(d && d.durationMs ? d.durationMs : 3000); });
    on('result', (d) => { renderResources(); if (d && d.action) disableDuring(d.cooldownMs || 5000, d.action); });
    on('deny', (d) => {
      const reason = d && d.reason;
      if (reason === 'no-hearts') { if (typeof twToast === 'function') twToast(T('worlds.noHearts')); }
      else if (reason === 'cooldown') { if (typeof twToast === 'function') twToast(T('worlds.cooldown')); }
    });
    on('chat', (d) => { if (d) appendChat(d); });
  })();
