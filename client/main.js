// main.js - wire UI, socket and canvas
(function(){
  const name = prompt('Display name (optional)') || 'Anon';
  const socket = SocketClient.connect(name);

  const colorInput = document.getElementById('color');
  const widthInput = document.getElementById('width');
  const brushBtn = document.getElementById('brush');
  const eraserBtn = document.getElementById('eraser');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const usersDiv = document.getElementById('users');

  let tool = 'brush';
  brushBtn.onclick = () => tool = 'brush';
  eraserBtn.onclick = () => tool = 'eraser';

  const canvasEl = document.getElementById('canvas');
  const ctx = CanvasApp.getContext();
  const debugEl = document.getElementById('debug');
  const debugPtrEl = document.getElementById('debug-pointer');
  const debugOverlay = document.getElementById('debugOverlay');
  const DPR = window.devicePixelRatio || 1;
  // debugOverlay is no longer used to persist strokes; keep it sized so cursors overlay correctly
  if (debugOverlay) {
    function resizeDebugOverlay() {
      const r = canvasEl.getBoundingClientRect();
      debugOverlay.style.width = Math.floor(r.width) + 'px';
      debugOverlay.style.height = Math.floor(r.height) + 'px';
      debugOverlay.width = Math.max(1, Math.floor(r.width * DPR));
      debugOverlay.height = Math.max(1, Math.floor(r.height * DPR));
      debugOctx = debugOverlay.getContext('2d');
      debugOctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      debugOctx.clearRect(0,0,r.width,r.height);
    }
    resizeDebugOverlay();
    window.addEventListener('resize', () => requestAnimationFrame(resizeDebugOverlay));
  }

  // draw an op into the debug overlay (persistent)
  function drawOpToDebug(op) {
    if (!debugOctx || !op || !op.path || op.path.length === 0) return;
    debugOctx.save();
    if (op.color === 'eraser') {
      debugOctx.globalCompositeOperation = 'destination-out';
      debugOctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      debugOctx.globalCompositeOperation = 'source-over';
      debugOctx.strokeStyle = op.color || '#000';
    }
    debugOctx.lineWidth = op.width || 4;
    debugOctx.lineJoin = 'round';
    debugOctx.lineCap = 'round';
    debugOctx.beginPath();
    const p0 = op.path[0];
    debugOctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < op.path.length; i++) {
      const p = op.path[i];
      debugOctx.lineTo(p.x, p.y);
    }
    debugOctx.stroke();
    debugOctx.restore();
  }

  // Debug counters/state
  const debugState = { ptrDown: 0, ptrMove: 0, drawSent: 0, drawRecv: 0, connected: false };
  function updateDebug() {
    if (!debugEl) return;
    const rect = canvasEl.getBoundingClientRect();
    debugEl.innerHTML = `Conn: ${debugState.connected ? '●' : '○'} &nbsp; PTRdown: ${debugState.ptrDown} &nbsp; PTRmove: ${debugState.ptrMove} <br> Draws sent: ${debugState.drawSent} &nbsp; received: ${debugState.drawRecv} <br> Canvas: ${Math.floor(rect.width)}x${Math.floor(rect.height)}`;
  }
  updateDebug();

  // pointer handling
  let drawing = false;
  let currentPath = [];

  function emitPointer(e) {
    const rect = canvasEl.getBoundingClientRect();
    // use CSS pixel coordinates (canvas contexts are scaled to devicePixelRatio)
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    SocketClient.emit('pointer', { x, y });
  }

  canvasEl.addEventListener('pointerdown', (e) => {
    drawing = true;
    currentPath = [];
    canvasEl.setPointerCapture(e.pointerId);
    // compute CSS pixel coords
    const rect = canvasEl.getBoundingClientRect();
    const startX = (e.clientX - rect.left);
    const startY = (e.clientY - rect.top);
    currentPath.push({ x: startX, y: startY });
  debugState.ptrDown += 1; updateDebug();
  // show debug pointer at start
  if (debugPtrEl) { debugPtrEl.style.display = 'block'; debugPtrEl.style.left = e.clientX + 'px'; debugPtrEl.style.top = e.clientY + 'px'; }
    // visible dot so user knows pointerdown worked
    try {
      const w = parseInt(widthInput.value, 10) || 4;
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = tool === 'eraser' ? 'rgba(0,0,0,0.5)' : colorInput.value;
      ctx.arc(startX, startY, Math.max(1, w/2), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    } catch (err) { console.debug('dot draw failed', err); }
    emitPointer(e);
    e.preventDefault();
  });

  canvasEl.addEventListener('pointermove', (e) => {
    emitPointer(e);
    if (!drawing) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    currentPath.push({ x, y });
  debugState.ptrMove += 1; if (debugState.ptrMove % 5 === 0) updateDebug();
  if (debugPtrEl) { debugPtrEl.style.left = e.clientX + 'px'; debugPtrEl.style.top = e.clientY + 'px'; }
    // immediate local draw for responsiveness: draw the whole currentPath so the stroke is continuous
    const tempOp = { type:'stroke', path: currentPath.slice(), color: tool==='eraser'?'eraser':colorInput.value, width: parseInt(widthInput.value,10) };
    CanvasApp.drawStroke(tempOp, ctx);
    // (removed persistent debug overlay) draw is handled by CanvasApp.drawStroke above
    // debug
    try { console.debug('pointermove', currentPath.length, x, y); } catch(e) {}
    // throttle sending: send path chunks when length > 20
    if (currentPath.length >= 20) {
      const send = { id: 'op-'+Date.now(), type:'stroke', userId: socket.id, path: CanvasApp.decimatePath(currentPath,1), color: tool==='eraser'?'eraser':colorInput.value, width: parseInt(widthInput.value,10) };
      // register the op locally so server echo doesn't duplicate drawing
      try { window.__localOps = window.__localOps || []; window.__localOps.push(send); } catch (err) { console.debug('localOps push failed', err); }
      console.debug && console.debug('emit draw', send.path.length);
      SocketClient.emit('draw', send);
      debugState.drawSent += 1; updateDebug();
      currentPath = [];
    }
  });

  canvasEl.addEventListener('pointerup', (e) => {
    if (!drawing) return;
    drawing = false;
    canvasEl.releasePointerCapture(e.pointerId);
    if (currentPath.length) {
      const send = { id: 'op-'+Date.now(), type:'stroke', userId: socket.id, path: CanvasApp.decimatePath(currentPath,1), color: tool==='eraser'?'eraser':colorInput.value, width: parseInt(widthInput.value,10) };
      try { window.__localOps = window.__localOps || []; window.__localOps.push(send); } catch (err) { console.debug('localOps push failed', err); }
      SocketClient.emit('draw', send);
      debugState.drawSent += 1; updateDebug();
      currentPath = [];
    }
  });

    if (debugPtrEl) { debugPtrEl.style.display = 'none'; }
  undoBtn.onclick = () => {
    console.debug('emit undo');
    SocketClient.emit('undo', { userId: socket.id });
    // request authoritative state shortly after to force sync
    setTimeout(() => SocketClient.emit('requestState'), 150);
  };
  redoBtn.onclick = () => {
    console.debug('emit redo');
    SocketClient.emit('redo', { userId: socket.id });
    setTimeout(() => SocketClient.emit('requestState'), 150);
  };

  // socket events
  SocketClient.on('init', (payload) => {
    // payload.state.operations -> replay
    if (payload && payload.state && payload.state.operations) {
      CanvasApp.replay(payload.state.operations);
      // clear overlay and replay ops onto debug overlay
      try {
        if (debugOctx) {
          const r = canvasEl.getBoundingClientRect();
          debugOctx.clearRect(0,0,r.width,r.height);
          // store local copy of operations and draw
          window.__localOps = payload.state.operations.slice();
          for (const op of window.__localOps) drawOpToDebug(op);
        }
      } catch (err) { console.debug('replay overlay failed', err); }
    }
    if (payload && payload.users) updateUsers(payload.users);
    debugState.drawRecv = (payload && payload.state && payload.state.operations) ? (payload.state.operations.length) : debugState.drawRecv;
    updateDebug();
  });

  SocketClient.on('draw', (op) => {
    // handle op only if alive
    if (!op || op.alive === false) return;
    window.__localOps = window.__localOps || [];
    // if we already have this op (origin that drew it), avoid drawing a duplicate
    const exists = window.__localOps.findIndex(o => o.id === op.id) !== -1;
    if (!exists) {
      try { CanvasApp.drawStroke(op, ctx); } catch (err) { console.debug('drawStroke failed', err); }
    }
    // ensure canonical op is stored locally (push or replace)
    try {
      if (!exists) window.__localOps.push(op);
      else {
        const idx = window.__localOps.findIndex(o => o.id === op.id);
        if (idx !== -1) window.__localOps[idx] = op;
      }
    } catch (err) { console.debug('localOps push/replace failed', err); }
    debugState.drawRecv += 1; updateDebug();
    try { drawOpToDebug(op); } catch (err) { console.debug('drawOpToDebug failed', err); }
  });

  // receive authoritative state updates (used after undo/redo)
  SocketClient.on('state', (state) => {
    try {
      if (state && state.operations) {
        // update main and overlay
        CanvasApp.replay(state.operations);
        if (debugOctx) {
          const r = canvasEl.getBoundingClientRect();
          debugOctx.clearRect(0,0,r.width,r.height);
          // update local copy and redraw overlay
          window.__localOps = state.operations.slice();
          for (const op of window.__localOps) drawOpToDebug(op);
        }
        debugState.drawRecv = state.operations.length;
        updateDebug();
      }
    } catch (err) { console.debug('state handler failed', err); }
  });

  SocketClient.on('pointer', (p) => {
    CanvasApp.setCursor(p.userId, p.x, p.y, '#0a0');
    setTimeout(() => CanvasApp.removeCursor(p.userId), 2000);
  });

  SocketClient.on('users', (users) => updateUsers(users));

  SocketClient.on('undo', (result) => {
    // Apply undo optimistically to local operations (server also emits 'state' shortly).
    try {
      window.__localOps = window.__localOps || [];
      if (result && result.opId) {
        const idx = window.__localOps.findIndex(o => o.id === result.opId);
        if (idx !== -1) {
          window.__localOps[idx].alive = false;
          CanvasApp.replay(window.__localOps);
          if (debugOctx) {
            const r = canvasEl.getBoundingClientRect();
            debugOctx.clearRect(0,0,r.width,r.height);
            for (const op of window.__localOps) if (op.alive !== false) drawOpToDebug(op);
          }
        } else {
          // fallback: ask for authoritative state if we don't have the op locally
          SocketClient.emit('requestState');
        }
      } else {
        SocketClient.emit('requestState');
      }
    } catch (err) { console.debug('undo handler failed', err); }
  });

  // socket connection status
  if (socket) {
    socket.on('connect', () => { debugState.connected = true; updateDebug(); });
    socket.on('disconnect', () => { debugState.connected = false; updateDebug(); });
  }

  SocketClient.on('redo', (result) => {
    // Apply redo optimistically similar to undo
    try {
      window.__localOps = window.__localOps || [];
      if (result && result.opId) {
        const idx = window.__localOps.findIndex(o => o.id === result.opId);
        if (idx !== -1) {
          window.__localOps[idx].alive = true;
          CanvasApp.replay(window.__localOps);
          if (debugOctx) {
            const r = canvasEl.getBoundingClientRect();
            debugOctx.clearRect(0,0,r.width,r.height);
            for (const op of window.__localOps) if (op.alive !== false) drawOpToDebug(op);
          }
        } else {
          SocketClient.emit('requestState');
        }
      } else {
        SocketClient.emit('requestState');
      }
    } catch (err) { console.debug('redo handler failed', err); }
  });

  function updateUsers(users) {
    usersDiv.innerHTML = users.map(u => `<span style="color:${u.color||'#000'}">${u.name||u.id}</span>`).join(' | ');
  }

  // refresh canvas size in debug every 500ms
  setInterval(updateDebug, 500);
})();
