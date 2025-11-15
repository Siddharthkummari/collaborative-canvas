const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Serve client static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Debug endpoint: returns current state for a room (useful to inspect alive flags)
app.get('/debug/state', (req, res) => {
  const room = req.query.room || 'main';
  try {
    const st = rooms.getState(room);
    res.json({ ok: true, room, state: st });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Rooms manager keeps per-room state and history
const rooms = new RoomManager(io);

io.on('connection', (socket) => {
  // join room (default 'main')
  const { room = 'main', name } = socket.handshake.query || {};
  socket.join(room);
  const user = { id: socket.id, name: name || 'Anonymous' };

  rooms.addUser(room, user);

  // Send current state and user list
  socket.emit('init', { state: rooms.getState(room), users: rooms.getUsers(room) });
  io.to(room).emit('users', rooms.getUsers(room));

  // drawing events
  socket.on('draw', (op) => {
    // op: { id, type: 'stroke', userId, path: [{x,y}], color, width }
    // store operation (server canonical copy) and broadcast that stored op
    const stored = rooms.pushOperation(room, op);
    // broadcast canonical stored op (includes alive flag) to all clients in room
    io.to(room).emit('draw', stored);
    console.log(`[${room}] draw op ${stored && stored.id} from ${socket.id}`);
  });

  // pointer move for cursor indicator
  socket.on('pointer', (ptr) => {
    // ptr: { x,y, userId }
    socket.to(room).emit('pointer', { ...ptr, userId: socket.id });
  });

  // undo/redo
  socket.on('undo', (request) => {
    // request: { userId }
    const result = rooms.undo(room, request.userId);
    if (result) {
      io.to(room).emit('undo', result);
      // also send full updated state so clients can replay immediately
      const state = rooms.getState(room);
      io.to(room).emit('state', state);
      console.log(`[${room}] undo by ${request.userId} -> op ${result.opId}; state size ${state.operations.length}`);
    }
  });

  socket.on('redo', (request) => {
    const result = rooms.redo(room, request.userId);
    if (result) {
      io.to(room).emit('redo', result);
      const state = rooms.getState(room);
      io.to(room).emit('state', state);
      console.log(`[${room}] redo by ${request.userId} -> op ${result.opId}; state size ${state.operations.length}`);
    }
  });

  // client may request full state replay
  socket.on('requestState', () => {
    try {
      socket.emit('init', { state: rooms.getState(room), users: rooms.getUsers(room) });
      console.log(`[${room}] requestState -> init sent to ${socket.id}`);
    } catch (err) {
      console.error('requestState failed', err);
    }
  });

  socket.on('disconnect', () => {
    rooms.removeUser(room, socket.id);
    io.to(room).emit('users', rooms.getUsers(room));
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
