  // Tinyverse — play-mode chat panel.
  // Wires to 47-worlds-room.js events (chat / typing / peers / you / enter / leave).
  // Reuses mp-chat-* class names so the base CSS in tiny-world.css applies;
  // adds tw-play-chat-* overrides for dark glassmorphism in play mode.
  // NO emoji, NO PNG icons. IIFE-wrapped; no globals leak.
  (function wirePlayChat() {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const WS = (window.__tinyworldWorlds = window.__tinyworldWorlds || {});
    function on(ev, cb) { if (typeof WS.on === 'function') WS.on(ev, cb); }
    function ic(name, size) { return typeof WS.icon === 'function' ? WS.icon(name, size) : document.createElement('span'); }

    // ---- CSS ---------------------------------------------------------------
    function injectStyles() {
      if (document.getElementById('tw-play-chat-css')) return;
      const s = document.createElement('style');
      s.id = 'tw-play-chat-css';
      s.textContent = `
        /* Dark glassmorphism overrides — only active in play mode */
        body.tw-worlds-play .mp-chat-toggle {
          background: rgba(8,11,28,.82);
          border: 1px solid rgba(80,110,200,.28);
          box-shadow: inset 0 1px 0 rgba(120,150,230,.14), 0 8px 24px -8px rgba(0,0,20,.55);
          color: #cfe0ff;
        }
        body.tw-worlds-play .mp-chat-toggle:hover {
          background: rgba(14,18,44,.9);
          color: #fff;
        }
        body.tw-worlds-play .mp-chat-toggle.is-open {
          background: rgba(20,30,70,.88);
          border-color: rgba(80,130,240,.45);
          box-shadow: inset 0 1px 0 rgba(160,190,255,.18), 0 0 0 2px rgba(80,130,230,.22), 0 8px 24px -8px rgba(0,0,20,.55);
          color: #a8c8ff;
        }
        body.tw-worlds-play .mp-chat-panel {
          background: rgba(8,11,28,.88);
          border: 1px solid rgba(80,110,200,.22);
          border-radius: 14px;
          box-shadow: inset 0 1px 0 rgba(120,150,230,.12), 0 20px 48px -12px rgba(0,0,20,.65);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
          color: #cfe0ff;
        }
        body.tw-worlds-play .mp-chat-head {
          border-bottom: 1px solid rgba(80,110,200,.18);
        }
        body.tw-worlds-play .mp-chat-head::after {
          background: rgba(80,110,200,.18);
        }
        body.tw-worlds-play .mp-chat-close {
          color: #8aa4d0;
          background: transparent;
          border: none;
        }
        body.tw-worlds-play .mp-chat-close:hover {
          background: rgba(255,255,255,.08);
          color: #cfe0ff;
        }
        body.tw-worlds-play .mp-chat-tabs {
          border-bottom: 1px solid rgba(80,110,200,.18);
          background: transparent;
        }
        body.tw-worlds-play .mp-chat-tab {
          color: #8aa4d0;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          border-radius: 0;
          box-shadow: none;
          padding: 8px 12px;
        }
        body.tw-worlds-play .mp-chat-tab.is-active {
          color: #cfe0ff;
          background: transparent;
          border: none;
          border-bottom: 2px solid #5a8ae0;
          box-shadow: none;
        }
        body.tw-worlds-play .mp-chat-log {
          background: transparent;
        }
        body.tw-worlds-play .mp-chat-msg {
          background: rgba(20,30,60,.35);
          border: 1px solid rgba(80,110,200,.12);
          border-radius: 8px;
        }
        body.tw-worlds-play .mp-chat-msg.is-self {
          background: rgba(40,60,120,.45);
          border-color: rgba(80,130,230,.22);
        }
        body.tw-worlds-play .mp-chat-name {
          font-family: 'Space Grotesk', system-ui, sans-serif;
          font-weight: 700;
        }
        body.tw-worlds-play .mp-chat-time {
          color: rgba(180,200,240,.5);
        }
        body.tw-worlds-play .mp-chat-text {
          color: #d8e8ff;
          font-family: 'Space Grotesk', system-ui, sans-serif;
        }
        body.tw-worlds-play .mp-chat-typing {
          color: rgba(180,200,240,.65);
          font-family: 'Space Grotesk', system-ui, sans-serif;
          font-style: italic;
        }
        body.tw-worlds-play .mp-chat-input {
          background: rgba(4,6,20,.65);
          border: 1px solid rgba(80,110,200,.28);
          border-radius: 8px;
          color: #cfe0ff;
          font-family: 'Space Grotesk', system-ui, sans-serif;
        }
        body.tw-worlds-play .mp-chat-input::placeholder { color: rgba(160,190,240,.45); }
        body.tw-worlds-play .mp-chat-input:focus {
          border-color: rgba(80,130,230,.6);
          background: rgba(8,12,30,.8);
          outline: none;
          box-shadow: 0 0 0 2px rgba(80,130,230,.2);
        }
        body.tw-worlds-play .mp-chat-send {
          background: rgba(30,50,120,.55);
          border: 1px solid rgba(80,110,200,.28);
          border-radius: 8px;
          color: #a8c8ff;
        }
        body.tw-worlds-play .mp-chat-send:hover {
          background: rgba(40,70,180,.65);
          color: #cfe0ff;
        }

        /* Play-chat heading (Pixelify Sans) */
        body.tw-worlds-play .mp-chat-head-title {
          font-family: 'Pixelify Sans', monospace;
          font-size: 13px;
          color: #cfe0ff;
          letter-spacing: .03em;
        }

        /* Players tab */
        .tw-play-chat-players { display: none; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1 1 auto; padding: 8px 6px; }
        .tw-play-chat-players.is-active { display: flex; }
        .tw-play-chat-player-row {
          display: flex; align-items: center; gap: 8px; padding: 5px 8px;
          border-radius: 8px;
          background: rgba(20,30,60,.35);
          border: 1px solid rgba(80,110,200,.12);
          font-family: 'Space Grotesk', system-ui, sans-serif;
          font-size: 12px; color: #cfe0ff;
        }
        .tw-play-chat-player-row.is-self { border-color: rgba(80,130,230,.3); }
        .tw-play-chat-av {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; font-family: 'Space Grotesk', system-ui, sans-serif;
          color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.4);
        }
        .tw-play-chat-pname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tw-play-chat-you { font-size: 9px; color: rgba(160,190,240,.55); background: rgba(80,110,200,.15);
          border: 1px solid rgba(80,110,200,.2); border-radius: 4px; padding: 1px 4px; flex-shrink: 0; }
      `;
      document.head.appendChild(s);
    }

    // ---- state -------------------------------------------------------------
    let toggleEl = null, panelEl = null, logEl = null, typingEl = null;
    let inputEl = null, playersEl = null, badgeEl = null;
    let chatTabEl = null, playersTabEl = null;
    let activeTab = 'chat';
    let isOpen = false;
    let unread = 0;
    let typingPeers = new Map(); // id -> { name, timer }
    let myId = null;
    let peers = [];

    // ---- helpers -----------------------------------------------------------
    function initials(name) {
      const parts = String(name || '?').trim().split(/\s+/);
      return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
    }

    function fmtTime(ts) {
      const d = new Date(ts || Date.now());
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    function isVisible() { return !!panelEl && panelEl.classList.contains('visible'); }

    // ---- DOM ---------------------------------------------------------------
    function ensureToggle() {
      if (toggleEl) return toggleEl;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mp-chat-toggle';
      btn.dataset.posType = 'play';
      btn.setAttribute('aria-label', 'Open play chat');
      btn.appendChild(ic('chat', 18));
      const badge = document.createElement('span');
      badge.className = 'mp-chat-badge';
      badge.setAttribute('aria-hidden', 'true');
      btn.appendChild(badge);
      btn.addEventListener('click', toggleChat);
      document.body.appendChild(btn);
      toggleEl = btn;
      badgeEl = badge;
      return btn;
    }

    function ensurePanel() {
      if (panelEl) return panelEl;

      const panel = document.createElement('section');
      panel.className = 'mp-chat-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Play mode chat');

      // Head
      const head = document.createElement('div');
      head.className = 'mp-chat-head';
      head.setAttribute('aria-label', 'Drag to move chat');
      const title = document.createElement('span');
      title.className = 'mp-chat-head-title';
      title.textContent = 'Chat';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'mp-chat-close';
      closeBtn.setAttribute('aria-label', 'Close chat');
      closeBtn.appendChild(ic('close', 13));
      closeBtn.addEventListener('click', closeChat);
      head.appendChild(title);
      head.appendChild(closeBtn);

      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'mp-chat-tabs';
      tabs.style.gridTemplateColumns = '1fr 1fr';
      chatTabEl = makeTab('Chat', 'chat', true);
      playersTabEl = makeTab('Players', 'person', false);
      chatTabEl.addEventListener('click', () => setTab('chat'));
      playersTabEl.addEventListener('click', () => setTab('players'));
      tabs.appendChild(chatTabEl);
      tabs.appendChild(playersTabEl);

      // Log
      const log = document.createElement('div');
      log.className = 'mp-chat-log';
      log.setAttribute('aria-live', 'polite');

      // Players list
      const players = document.createElement('div');
      players.className = 'tw-play-chat-players';

      // Typing
      const typing = document.createElement('div');
      typing.className = 'mp-chat-typing';

      // Form
      const form = document.createElement('form');
      form.className = 'mp-chat-form';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'mp-chat-input';
      input.maxLength = 280;
      input.placeholder = 'Message...';
      input.setAttribute('aria-label', 'Chat message');
      input.autocomplete = 'off';
      const sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.className = 'mp-chat-send';
      sendBtn.setAttribute('aria-label', 'Send');
      sendBtn.appendChild(ic('send', 16));
      form.appendChild(input);
      form.appendChild(sendBtn);

      let typingTimer = null;
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const text = input.value.trim();
        if (text && typeof WS.sendChat === 'function') WS.sendChat(text);
        input.value = '';
        clearTimeout(typingTimer);
        if (typeof WS.sendTyping === 'function') WS.sendTyping(false);
      });
      input.addEventListener('input', () => {
        if (typeof WS.sendTyping === 'function') {
          WS.sendTyping(input.value.trim().length > 0);
          clearTimeout(typingTimer);
          typingTimer = setTimeout(() => {
            if (typeof WS.sendTyping === 'function') WS.sendTyping(false);
          }, 3000);
        }
      });
      input.addEventListener('blur', () => {
        clearTimeout(typingTimer);
        if (typeof WS.sendTyping === 'function') WS.sendTyping(false);
      });

      panel.appendChild(head);
      panel.appendChild(tabs);
      panel.appendChild(log);
      panel.appendChild(players);
      panel.appendChild(typing);
      panel.appendChild(form);
      document.body.appendChild(panel);

      panelEl = panel;
      logEl = log;
      typingEl = typing;
      inputEl = input;
      playersEl = players;

      wireDrag(panel, head);
      setTab('chat');
      return panel;
    }

    function makeTab(label, iconName, active) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'mp-chat-tab' + (active ? ' is-active' : '');
      tab.appendChild(ic(iconName, 13));
      const span = document.createElement('span');
      span.textContent = label;
      tab.appendChild(span);
      return tab;
    }

    function setTab(tab) {
      activeTab = tab;
      if (!logEl || !playersEl) return;
      if (tab === 'chat') {
        logEl.style.display = '';
        playersEl.classList.remove('is-active');
        if (chatTabEl) chatTabEl.className = 'mp-chat-tab is-active';
        if (playersTabEl) playersTabEl.className = 'mp-chat-tab';
      } else {
        logEl.style.display = 'none';
        playersEl.classList.add('is-active');
        if (chatTabEl) chatTabEl.className = 'mp-chat-tab';
        if (playersTabEl) playersTabEl.className = 'mp-chat-tab is-active';
      }
    }

    // ---- drag --------------------------------------------------------------
    function wireDrag(panel, head) {
      let dragging = false, ox = 0, oy = 0;
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.mp-chat-close')) return;
        dragging = true; panel.classList.add('dragging');
        const r = panel.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
      });
      head.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        panel.style.left = Math.min(Math.max(0, e.clientX - ox), vw - pw) + 'px';
        panel.style.top  = Math.min(Math.max(0, e.clientY - oy), vh - ph) + 'px';
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
      });
      head.addEventListener('pointerup', () => { dragging = false; panel.classList.remove('dragging'); });
    }

    // ---- chat operations ---------------------------------------------------
    function openChat() {
      ensurePanel();
      ensureToggle();
      panelEl.classList.add('visible');
      toggleEl.classList.add('is-open');
      isOpen = true;
      unread = 0; updateBadge();
      if (activeTab === 'chat') scrollLog();
    }

    function closeChat() {
      if (panelEl) panelEl.classList.remove('visible');
      if (toggleEl) toggleEl.classList.remove('is-open');
      isOpen = false;
      // Return keyboard focus to the document so WASD/arrow movement works again.
      if (inputEl && document.activeElement === inputEl) inputEl.blur();
    }

    function toggleChat() { isOpen ? closeChat() : openChat(); }

    function updateBadge() {
      if (!badgeEl) return;
      if (unread > 0 && !isOpen) {
        badgeEl.textContent = unread > 99 ? '99+' : String(unread);
        badgeEl.classList.add('visible');
      } else {
        badgeEl.classList.remove('visible');
      }
    }

    function scrollLog() {
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }

    // ---- message rendering -------------------------------------------------
    function addMessage(d) {
      if (!logEl) return;
      const currentId = (typeof WS.getMyId === 'function' ? WS.getMyId() : null) || myId;
      const self = d.id && d.id === currentId;
      const row = document.createElement('div');
      row.className = 'mp-chat-msg' + (self ? ' is-self' : '');

      const meta = document.createElement('div');
      meta.className = 'mp-chat-meta';

      // colored avatar dot
      const av = document.createElement('span');
      av.className = 'tw-play-chat-av';
      av.style.background = d.color || peerColor(d.id);
      av.style.width = '18px'; av.style.height = '18px'; av.style.fontSize = '8px';
      av.textContent = initials(d.name || '?');
      meta.appendChild(av);

      const nameEl = document.createElement('span');
      nameEl.className = 'mp-chat-name';
      nameEl.style.color = d.color || peerColor(d.id);
      nameEl.textContent = d.name || 'Player';
      meta.appendChild(nameEl);

      const timeEl = document.createElement('span');
      timeEl.className = 'mp-chat-time';
      timeEl.textContent = fmtTime(d.ts);
      meta.appendChild(timeEl);

      const textEl = document.createElement('div');
      textEl.className = 'mp-chat-text';
      textEl.textContent = d.text;

      row.appendChild(meta);
      row.appendChild(textEl);
      logEl.appendChild(row);

      if (isOpen && activeTab === 'chat') { scrollLog(); }
      else if (!isOpen) { unread++; updateBadge(); }
    }

    function peerColor(id) {
      const p = peers.find(x => x.id === id);
      return (p && p.color) || '#5a78e0';
    }

    // ---- typing indicators -------------------------------------------------
    function updateTyping(d) {
      if (!typingEl) return;
      if (d.typing) {
        clearTimeout(typingPeers.has(d.id) ? typingPeers.get(d.id).timer : null);
        const timer = setTimeout(() => { typingPeers.delete(d.id); renderTyping(); }, 4000);
        typingPeers.set(d.id, { name: d.name || 'Player', timer });
      } else {
        if (typingPeers.has(d.id)) {
          clearTimeout(typingPeers.get(d.id).timer);
          typingPeers.delete(d.id);
        }
      }
      renderTyping();
    }

    function renderTyping() {
      if (!typingEl) return;
      const names = Array.from(typingPeers.values()).map(t => t.name);
      if (names.length === 0) {
        typingEl.textContent = '';
        typingEl.classList.remove('visible');
      } else {
        typingEl.textContent = names.length === 1
          ? names[0] + ' is typing...'
          : names.slice(0, 2).join(', ') + ' are typing...';
        typingEl.classList.add('visible');
      }
    }

    // ---- players list ------------------------------------------------------
    function renderPlayers(you) {
      if (!playersEl) return;
      playersEl.innerHTML = '';

      // Self row first
      const selfName = typeof WS.playerName === 'function' ? WS.playerName() : 'You';
      const selfColor = typeof WS.playerColor === 'function' ? WS.playerColor() : '#5a78e0';
      playersEl.appendChild(makePlayerRow(myId, selfName, selfColor, true));

      for (const p of peers) {
        playersEl.appendChild(makePlayerRow(p.id, p.name || 'Player', p.color || '#5a78e0', false));
      }
    }

    function makePlayerRow(id, name, color, isSelf) {
      const row = document.createElement('div');
      row.className = 'tw-play-chat-player-row' + (isSelf ? ' is-self' : '');
      const av = document.createElement('span');
      av.className = 'tw-play-chat-av';
      av.style.background = color;
      av.textContent = initials(name);
      const nameEl = document.createElement('span');
      nameEl.className = 'tw-play-chat-pname';
      nameEl.style.color = color;
      nameEl.textContent = name;
      row.appendChild(av);
      row.appendChild(nameEl);
      if (isSelf) {
        const you = document.createElement('span');
        you.className = 'tw-play-chat-you';
        you.textContent = 'you';
        row.appendChild(you);
      }
      return row;
    }

    // ---- WS event wiring ---------------------------------------------------
    on('enter', () => {
      injectStyles();
      ensureToggle();
      ensurePanel();
      toggleEl.style.display = 'inline-flex';
    });

    on('leave', () => {
      if (toggleEl) toggleEl.style.display = 'none';
      closeChat();
      // Reset state
      typingPeers.clear();
      if (typingEl) typingEl.textContent = '';
      peers = [];
      unread = 0;
    });

    on('you', (you) => {
      myId = (typeof WS.getMyId === 'function' ? WS.getMyId() : null) || myId;
      renderPlayers(you);
    });

    on('peers', (ps) => {
      peers = ps || [];
      renderPlayers(null);
    });

    on('chat', (d) => {
      addMessage(d);
    });

    on('typing', (d) => {
      updateTyping(d);
    });

    on('status', (d) => {
      if (d && !d.connected) {
        typingPeers.clear();
        renderTyping();
      }
    });

    // Start hidden
    setTimeout(() => {
      ensureToggle();
      if (toggleEl) toggleEl.style.display = 'none';
    }, 0);

  })();
