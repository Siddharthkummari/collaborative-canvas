// canvas.js - drawing logic (vanilla JS)
(function(){
  const canvas = document.getElementById('canvas');
  const cursCanvas = document.getElementById('cursors');
  const ctx = canvas.getContext('2d');
  const cctx = cursCanvas.getContext('2d');

  // High-DPI aware sizing: keep canvas backing store scaled by devicePixelRatio but draw in CSS pixels.
  const DPR = window.devicePixelRatio || 1;

  function setCanvasSize(preserve = true) {
    const r = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(r.width));
    const cssH = Math.max(1, Math.floor(r.height));

    // if preserving, copy existing backing store to a temp canvas
    let tmp, tctx;
    if (preserve && canvas.width && canvas.height) {
      tmp = document.createElement('canvas');
      tmp.width = canvas.width; tmp.height = canvas.height;
      tctx = tmp.getContext('2d');
      tctx.drawImage(canvas, 0, 0);
    }

    // set CSS size and backing store size
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    cursCanvas.style.width = cssW + 'px';
    cursCanvas.style.height = cssH + 'px';

    canvas.width = Math.max(1, Math.floor(cssW * DPR));
    canvas.height = Math.max(1, Math.floor(cssH * DPR));
    cursCanvas.width = canvas.width;
    cursCanvas.height = canvas.height;

    // scale contexts so drawing uses CSS pixel coordinates
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // restore pixels if preserved (will be scaled)
    if (tmp) ctx.drawImage(tmp, 0, 0, tmp.width / DPR, tmp.height / DPR, 0, 0, cssW, cssH);
  }

  // initial sizing
  setCanvasSize(false);

  // Resize handler to match layout
  window.addEventListener('resize', () => requestAnimationFrame(() => setCanvasSize(true)));

  // simple path smoothing/decimation: keep every Nth point
  function decimatePath(path, step = 1) {
    if (step <= 1) return path;
    const out = [];
    for (let i = 0; i < path.length; i += step) out.push(path[i]);
    return out;
  }

  function drawStroke(op, context) {
    // debug: log strokes being drawn
    try { console.debug && console.debug('drawStroke', op && op.type, op && op.path && op.path.length); } catch(e) {}
    if (!op || !op.path || op.path.length === 0) return;
    context.save();
    if (op.type === 'stroke') {
      if (op.color === 'eraser') {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = op.color || '#000';
      }
      context.lineWidth = op.width || 4;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.beginPath();
      const p0 = op.path[0];
      context.moveTo(p0.x, p0.y);
      for (let i = 1; i < op.path.length; i++) {
        const p = op.path[i];
        context.lineTo(p.x, p.y);
      }
      context.stroke();
    }
    context.restore();
  }

  // replay full operations list
  function replay(ops) {
    // clear using CSS pixel size (contexts are scaled by devicePixelRatio)
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    ctx.clearRect(0, 0, cssW, cssH);
    // draw only alive operations (tombstone model)
    for (const op of ops) {
      if (op && (op.alive === undefined || op.alive)) {
        drawStroke(op, ctx);
      }
    }
  }

  // draw remote cursors on overlay canvas
  const remoteCursors = new Map();
  function showCursors() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    cctx.clearRect(0,0,cssW,cssH);
    for (const [id, cur] of remoteCursors.entries()) {
      cctx.fillStyle = cur.color || '#f00';
      cctx.beginPath();
      cctx.arc(cur.x, cur.y, 6, 0, Math.PI*2);
      cctx.fill();
    }
  }

  // expose API
  window.CanvasApp = {
    drawStroke,
    replay,
    decimatePath,
    showCursors,
    setCursor(id, x, y, color) { remoteCursors.set(id, {x,y,color}); showCursors(); },
    removeCursor(id) { remoteCursors.delete(id); showCursors(); },
  getCanvasSize() { const r = canvas.getBoundingClientRect(); return { w: Math.floor(r.width), h: Math.floor(r.height) } },
    getContext() { return ctx }
  };

  // Debug: draw test rectangles on load to verify rendering pipeline
  (function drawSmokeTest() {
    try {
      console.info('CanvasApp smoke test: drawing test rectangles');
      // draw using scaled context (CanvasApp.getContext())
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,255,0.25)';
      ctx.fillRect(20,20,300,200);
      ctx.restore();

      // draw using raw DOM canvas context to rule out transforms
      const raw = canvas.getContext('2d');
      raw.save();
      raw.fillStyle = 'rgba(0,255,0,0.25)';
      raw.fillRect(360,240,200,120);
      raw.restore();

      console.info('CanvasApp smoke test: done');
    } catch (err) {
      console.error('CanvasApp smoke test failed', err);
    }
  })();
})();
