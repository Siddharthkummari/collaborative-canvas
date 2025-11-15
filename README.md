
Collaborative Canvas — Final README

A small real-time collaborative drawing demo using vanilla JavaScript (HTML5 Canvas) and Node.js + Socket.io.

This project demonstrates a practical, small-scale implementation of real-time drawing with global undo/redo (tombstone model), cursor indicators, rooms, and a minimal debug surface.

Quick Setup

1. Open PowerShell and run:

```powershell
Set-Location -LiteralPath 'c:\Users\siddharth\Downloads\flam\collaborative-canvas'
npm install
npm start
```

2. Open `http://localhost:3000` in one or more browser windows (or devices) to test multiple users joining the same room.

**How to test with multiple users**

- Open multiple browser windows or devices and navigate to `http://localhost:3000`.
- Provide a display name when prompted.
- Draw on one client and observe strokes appear on the other clients in (near) real time.
- Use the toolbar to change color, width, and to select the eraser.
- Press `Undo` to perform a global undo (it removes the last global stroke). Press `Redo` to reapply.

To inspect authoritative server state (room history with tombstone flags), open DevTools and run:

```javascript
fetch('/debug/state?room=main').then(r => r.json()).then(j => console.log('serverState', j)).catch(console.error);
```

**Known limitations / bugs**

- Global undo: Undo is global (last operation across all users). It is deterministic but not per-user.
- In-memory state: Room history is stored in server memory only. Restarting the server clears history.
- Scaling: The server sends full-ops replays (no incremental snapshot/diff or persistence). Very long histories will slow down `init`/`state` replays.
- Eraser semantics: Using `destination-out` makes eraser effects order-dependent; simultaneous erases/draws can lead to surprising visual results.
- Network resilience: Minimal reconnection handling; the demo relies on Socket.io's default reconnect behavior and a `requestState` fallback.

If you see a stroke dimly remaining after undo: that usually means a temporary/local-only stroke was drawn onto the persistent overlay before the server confirmed the canonical op. The client code attempts to avoid that by only persisting server-canonical ops; if you still observe it, reload and check the server `/debug/state` output to confirm `alive:false` for the undone op.

**Testing checklist**

- [ ] Draw from client A. Confirm client B receives strokes.
- [ ] Undo from client A. Confirm stroke disappears on A and B, and server `state` shows `alive: false`.
- [ ] Redo from client A. Confirm stroke returns and `alive: true` on server state.
- [ ] Simulate high event rate: draw several long strokes quickly and confirm app remains responsive.

**Time spent and notes**

- Estimated development & debugging time: ~6–8 hours (scaffold + debugging canvas scaling issues + implementing the tombstone undo/redo model and client reconciliation).
- Important fixes made during iteration:
  - DPR-aware canvas sizing (fixed invisible strokes).
  - Server-canonical op broadcast (clients receive ops with `alive` flags).
  - Client local op registry (`window.__localOps`) and optimistic undo/redo.

**Run & Debug commands (PowerShell)**

Start server:
```powershell
Set-Location -LiteralPath 'c:\Users\siddharth\Downloads\flam\collaborative-canvas'
npm start
```

Fetch debug state (PowerShell):
```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/debug/state?room=main' | ConvertTo-Json -Depth 10
```

Browser DevTools debug (console):
```javascript
// see server state
fetch('/debug/state?room=main').then(r => r.json()).then(j => console.info(j));
```

If you want, I can also add persistence (simple file or DB), snapshots to avoid long replays, or an automated multi-client test harness.

---
Upload this `README.md` as the project's final README.
# Collaborative Canvas

Simple real-time collaborative drawing canvas built with vanilla JS (HTML5 Canvas) and Node.js + Socket.io.

Setup

1. From project root:

```powershell
cd c:\Users\siddharth\Downloads\flam\collaborative-canvas
npm install
npm start
```

2. Open http://localhost:3000 in two browser windows (or two devices) and enter display names when prompted.

Known limitations

- Undo/redo is implemented server-side as naive global pop/redo of last operation. It's functional but not per-user nor conflict-aware in a sophisticated way.
- State transfer is full-ops replay; large histories will be slow. A binary snapshot or tile-based approach would scale better.
- No persistence: server state is in-memory only.

Time spent: ~1.5 hours creating starter implementation.

netlify deployed: https://friendly-sherbet-98f247.netlify.app/



