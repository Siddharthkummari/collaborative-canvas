// rooms.js - simple in-memory room manager and operation history
class Room {
  constructor(name) {
    this.name = name;
    this.users = new Map(); // id -> {id, name, color}
    this.operations = []; // list of ops in order, each op has { ...op, alive: true }
    this.undone = []; // stack for redo (stores op ids)
  }

  addUser(user) {
    this.users.set(user.id, { ...user, color: user.color || null });
  }

  removeUser(id) {
    this.users.delete(id);
  }

  getUsers() {
    return Array.from(this.users.values());
  }

  pushOperation(op) {
    // append op with alive flag, clear redo stack and return stored op
    const o = Object.assign({}, op, { alive: true });
    this.operations.push(o);
    this.undone = [];
    return o;
  }

  undo(userId) {
    // Global undo: mark last alive operation as not alive (tombstone)
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];
      if (op && op.alive) {
        op.alive = false;
        this.undone.push(op.id);
        return { opId: op.id, op };
      }
    }
    return null;
  }

  redo(userId) {
    // redo last undone op (mark alive true)
    if (this.undone.length === 0) return null;
    const opId = this.undone.pop();
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      if (op.id === opId) {
        op.alive = true;
        return { opId: op.id, op };
      }
    }
    return null;
  }

  getState() {
    // Return full operations list with alive flags; client will replay filtering alive ops
    return { operations: this.operations };
  }
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  _ensure(name) {
    if (!this.rooms.has(name)) this.rooms.set(name, new Room(name));
    return this.rooms.get(name);
  }

  addUser(roomName, user) {
    const r = this._ensure(roomName);
    r.addUser(user);
  }

  removeUser(roomName, userId) {
    const r = this._ensure(roomName);
    r.removeUser(userId);
  }

  getUsers(roomName) {
    const r = this._ensure(roomName);
    return r.getUsers();
  }

  pushOperation(roomName, op) {
    const r = this._ensure(roomName);
    return r.pushOperation(op);
  }

  undo(roomName, userId) {
    const r = this._ensure(roomName);
    return r.undo(userId);
  }

  redo(roomName, userId) {
    const r = this._ensure(roomName);
    return r.redo(userId);
  }

  getState(roomName) {
    const r = this._ensure(roomName);
    return r.getState();
  }
}

module.exports = { RoomManager };
