// websocket.js - thin wrapper around socket.io client
const SocketClient = (function() {
  let socket;
  function connect(name, room = 'main') {
    socket = io({ query: { room, name } });
    return socket;
  }

  function on(ev, cb) { if (socket) socket.on(ev, cb); }
  function emit(ev, payload) { if (socket) socket.emit(ev, payload); }

  return { connect, on, emit };
})();
