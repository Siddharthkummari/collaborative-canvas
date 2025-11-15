Architecture

This document describes the data flow, WebSocket protocol, undo/redo strategy, performance decisions, and conflict-resolution approach used by the Collaborative Canvas demo.

Goal: Keep the system simple and deterministic while providing responsive local drawing and global undo/redo semantics.

1) Data Flow (high level)

ASCII flow diagram (simplified):

```
 User (pointer events)
      |
      | pointer / local draw
      v
  Client (main canvas)
      |  emit `draw` op (batched/decimated)
      v
  Socket.io -> Server (room)
      |  store canonical op (op = { id, path, color, width, alive: true })
      |  push to room.operations, clear redo stack
      |  io.to(room).emit('draw', canonicalOp)
      v
  Clients in room receive canonicalOp
      |  -> store op locally (window.__localOps)
      |  -> persist to overlay (canonical persistent drawing)
      v
  Canvas (replay of ops where op.alive !== false)

Undo/Redo flow:

```
 Client --emit-> server: { type: 'undo', userId }
    server: room.undo() -> marks last alive op.alive = false; room.undone.push(op.id)
    server emits: io.to(room).emit('undo', { opId }) and io.to(room).emit('state', rooms.getState())
 Clients: on 'state' -> CanvasApp.replay(state.operations)
```

2) WebSocket Protocol (messages)

- Client -> Server
  - `draw` : { id, type:'stroke', userId, path: [{x,y}], color, width }
    - Sent when the client finishes a chunk or stroke. Clients decimate long paths periodically.
  - `pointer` : { x, y }
    - Lightweight cursor position updates for presence indicators.
  - `undo` : { userId }
  - `redo` : { userId }
  - `requestState` : {}  (client requests an authoritative replay)

- Server -> Client
  - `init` : { state: { operations: [...] }, users: [...] }
    - Sent on join or in response to `requestState`.
  - `draw` : { ...canonicalOp } (includes `alive: true`)
    - Server stores canonical op and broadcasts it to the room (including the origin) so every client stores the same object.
  - `pointer` : { x, y, userId }
  - `undo` : { opId }
  - `redo` : { opId }
  - `state` : { operations: [...] }
    - Full authoritative operations array (used to resync clients after undo/redo).

Notes:
- The server's `draw` broadcast sends the canonical op that includes `alive` (initially `true`). The client stores canonical ops into `window.__localOps` and persists them to the overlay so undos remove them deterministically.

3) Undo/Redo Strategy

- Model: Tombstone-based global undo (server-side authoritative).
  - Each stored op has an `alive` boolean.
  - `undo`: server finds the last op where `alive === true`, sets `alive = false` and pushes the op.id to `undone` stack.
  - `redo`: server pops an id from `undone`, finds the op and sets `alive = true`.
  - Server emits a `state` update after undo/redo so clients can replay the authoritative list.

- Rationale:
  - Deterministic and easy to reason about for a collaborative demo.
  - Replay is simple: redraw only ops where `alive !== false`.

- Trade-offs:
  - Not per-user undo; it is a global “undo last operation” model.
  - Requires full-ops replay to guarantee consistent canvas across clients (simple, but can be expensive for long histories).

4) Performance Decisions

- Batching and decimation: Clients decimate long paths (keep every Nth point or compress) and send chunks every N points. This reduces message rate for long strokes and keeps latency small for interactive drawing.

- DPR-aware canvas backing store: The canvas backing store is scaled by `devicePixelRatio` while the drawing coordinates are expressed in CSS pixels. This ensures crisp lines on high-DPI displays and avoids invisible drawing bugs.

- Server-side memory-only history: Simpler to implement and fast for development. For production, prefer snapshotting (periodic canvas bitmap snapshots or operation checkpoints) and storing operations into a persistent store.

5) Conflict Resolution

- Drawing operations are effectively additive; ordering matters mostly for blend/eraser operations.
- Strategy used: last-writer-wins for operation ordering (server appends ops in the order it processes them). Because operations are small and latency is low, this yields intuitive results in most cases.

- Eraser interactions: Eraser is implemented by drawing with `globalCompositeOperation = 'destination-out'`. Because that depends on order, simultaneous drawing + erasing can create non-intuitive results — this is accepted for this demo (documented in README).

6) Testing & Debugging Tools

- Debug endpoint: `/debug/state?room=main` returns `{ ok: true, room, state }` where `state.operations` is the canonical array with `alive` flags.
- Client local copy: `window.__localOps` (in the browser) contains the canonical ops the client knows about; useful for inspecting and replaying.

7) Next improvements (optional roadmap)

- Add persistence (file or DB) and snapshotting to avoid long full replays on join.
- Implement operation compression/deltas for very long paths.
- Consider a more advanced CRDT or operational transform approach for per-user undo and conflict-free merging if you need per-user undo or richer collaborative semantics.

---
Upload this `ARCHITECTURE.md` as the final architecture document for the project.


Architecture Overview

Data Flow

- Client captures pointer events and sends compact "draw" operations (op objects) to server via Socket.io.
- Server appends operations to the room's operation log and broadcasts each op to other clients.
- Clients draw incoming ops immediately (optimistic local draw is done for responsiveness).

WebSocket Protocol (messages)

- init: server -> client: full operations list and current users
- draw: client -> server: { id, type:'stroke', userId, path[], color, width }
- draw: server -> clients: same op object
- pointer: client -> server -> clients: { x,y, userId } for cursor indicators
- undo/redo: client -> server; server publishes undo/redo events

Undo/Redo Strategy

- Server maintains a linear operations list and an "undone" stack. Undo pops the last op and pushes to undone. Redo pops from undone and pushes back.
- This is a global undo (affects last global op). Clients replay operations to rebuild canvas.
- Tradeoffs: simple and deterministic, but not per-user undo. In real system we'd implement CRDT-style ops or tagged-operation tombstones with causal history.

Conflict Resolution & Performance Decisions

- Conflicts: last-writer-wins for operations; drawing is additive so overlap is allowed. Eraser is implemented with canvas destination-out so ordering matters.
- Performance: clients decimate and batch long paths before sending. Server broadcasts ops immediately for low latency. Large histories should be snapshotted in production.
