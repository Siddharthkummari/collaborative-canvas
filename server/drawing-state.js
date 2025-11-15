// drawing-state.js - helpers for serializing operations (expandable)

function makeStrokeOp({ id, userId, path, color, width }) {
  return { id, type: 'stroke', userId, path, color, width };
}

module.exports = { makeStrokeOp };
