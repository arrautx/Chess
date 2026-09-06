import "./src/env";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { createServer } from "http";
import { Chess } from "chess.js";
import jwt from "jsonwebtoken";
import type { ClientMessage, ServerMessage, Color, GameResult } from "@repo/shared";

const PORT = Number(process.env["WS_PORT"]) || 4001;
const JWT_SECRET = process.env["JWT_SECRET"] || "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET not set in ws-backend/.env");
}

// ── Room ──────────────────────────────────────────────────
interface Room {
  code: string;
  chess: Chess;
  white: WebSocket | null;
  black: WebSocket | null;
  whiteName: string;
  blackName: string;
  whiteId: number;
  blackId: number;
}

const rooms = new Map<string, Room>();
const wsToRoom = new Map<WebSocket, string>();

// ── Generate 6-char room code ─────────────────────────────
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

// ── Auth ──────────────────────────────────────────────────
function authenticate(token: string): { userId: number; username: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as {
      userId: number;
      username: string;
    };
    if (typeof decoded.userId === "number" && typeof decoded.username === "string") {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────
function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(room: Room, msg: ServerMessage) {
  const data = JSON.stringify(msg);
  if (room.white?.readyState === WebSocket.OPEN) room.white.send(data);
  if (room.black?.readyState === WebSocket.OPEN) room.black.send(data);
}

function checkGameOver(room: Room): boolean {
  if (!room.chess.isGameOver()) return false;

  let result: GameResult;
  let reason: string;

  if (room.chess.isCheckmate()) {
    const winner = room.chess.turn() === "w" ? "b" : "w";
    result = winner === "w" ? "1-0" : "0-1";
    reason = "Checkmate";
  } else if (room.chess.isStalemate()) {
    result = "1/2-1/2";
    reason = "Stalemate";
  } else if (room.chess.isThreefoldRepetition()) {
    result = "1/2-1/2";
    reason = "Threefold repetition";
  } else if (room.chess.isInsufficientMaterial()) {
    result = "1/2-1/2";
    reason = "Insufficient material";
  } else {
    result = "1/2-1/2";
    reason = "Draw";
  }

  broadcast(room, { type: "game_over", result, reason });
  return true;
}

// ── Handle messages ───────────────────────────────────────
function handleMessage(ws: WebSocket, raw: string) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  switch (msg.type) {
    // ── CREATE ROOM ──────────────────────────────────────
    case "create_room": {
      const user = authenticate(msg.token);
      if (!user) {
        send(ws, { type: "error", message: "Invalid token" });
        return;
      }

      // Leave any existing room first
      leaveCurrentRoom(ws);

      const code = generateCode();
      const room: Room = {
        code,
        chess: new Chess(),
        white: ws,
        black: null,
        whiteName: user.username,
        blackName: "",
        whiteId: user.userId,
        blackId: 0,
      };
      rooms.set(code, room);
      wsToRoom.set(ws, code);

      send(ws, {
        type: "room_created",
        code,
        color: "w",
      });

      console.log(`Room ${code} created by ${user.username}`);
      break;
    }

    // ── JOIN ROOM ────────────────────────────────────────
    case "join_room": {
      const user = authenticate(msg.token);
      if (!user) {
        send(ws, { type: "error", message: "Invalid token" });
        return;
      }

      const room = rooms.get(msg.code);
      if (!room) {
        send(ws, { type: "error", message: "Room not found" });
        return;
      }

      // Already in this room
      if (room.white === ws || room.black === ws) {
        send(ws, { type: "error", message: "Already in this room" });
        return;
      }

      // Room full
      if (room.white && room.black) {
        send(ws, { type: "error", message: "Room is full" });
        return;
      }

      // Can't join your own room
      if (room.whiteId === user.userId) {
        send(ws, { type: "error", message: "Cannot join your own room" });
        return;
      }

      // Leave any current room
      leaveCurrentRoom(ws);

      // Join as black
      room.black = ws;
      room.blackName = user.username;
      room.blackId = user.userId;
      wsToRoom.set(ws, msg.code);

      send(ws, {
        type: "room_joined",
        code: msg.code,
        color: "b",
        fen: room.chess.fen(),
        opponent: room.whiteName,
      });

      // Notify white player
      if (room.white) {
        send(room.white, {
          type: "opponent_joined",
          opponent: user.username,
        });
      }

      // Game starts!
      broadcast(room, {
        type: "game_started",
        fen: room.chess.fen(),
        white: room.whiteName,
        black: room.blackName,
      });

      console.log(`${user.username} joined room ${msg.code}`);
      break;
    }

    // ── LEAVE ROOM ───────────────────────────────────────
    case "leave_room": {
      leaveCurrentRoom(ws);
      break;
    }

    // ── MOVE ─────────────────────────────────────────────
    case "move": {
      const room = rooms.get(msg.code);
      if (!room) {
        send(ws, { type: "error", message: "Room not found" });
        return;
      }

      const color: Color | null =
        room.white === ws ? "w" : room.black === ws ? "b" : null;

      if (!color) {
        send(ws, { type: "error", message: "You are not in this room" });
        return;
      }

      if (!room.white || !room.black) {
        send(ws, { type: "error", message: "Waiting for opponent" });
        return;
      }

      // Must be your turn
      if (room.chess.turn() !== color) {
        send(ws, {
          type: "invalid_move",
          reason: "Not your turn",
          fen: room.chess.fen(),
        });
        return;
      }

      // Validate move
      const result = room.chess.move(msg.move);
      if (!result) {
        send(ws, {
          type: "invalid_move",
          reason: "Illegal move",
          fen: room.chess.fen(),
        });
        return;
      }

      const newTurn = room.chess.turn() as Color;

      broadcast(room, {
        type: "move_made",
        move: msg.move,
        fen: room.chess.fen(),
        turn: newTurn,
        by: color,
      });

      checkGameOver(room);
      break;
    }

    // ── RESIGN ───────────────────────────────────────────
    case "resign": {
      const room = rooms.get(msg.code);
      if (!room) {
        send(ws, { type: "error", message: "Room not found" });
        return;
      }

      const color: Color | null =
        room.white === ws ? "w" : room.black === ws ? "b" : null;

      if (!color) {
        send(ws, { type: "error", message: "You are not in this room" });
        return;
      }

      const winner = color === "w" ? "b" : "w";
      const result: GameResult = winner === "w" ? "1-0" : "0-1";

      broadcast(room, { type: "opponent_resigned", winner });

      rooms.delete(msg.code);
      wsToRoom.delete(room.white!);
      wsToRoom.delete(room.black!);
      break;
    }
  }
}

// ── Leave current room ────────────────────────────────────
function leaveCurrentRoom(ws: WebSocket) {
  const code = wsToRoom.get(ws);
  if (!code) return;

  const room = rooms.get(code);
  if (room) {
    const color = room.white === ws ? "w" : room.black === ws ? "b" : null;

    if (color === "w") {
      room.white = null;
      room.whiteName = "";
      room.whiteId = 0;
    } else {
      room.black = null;
      room.blackName = "";
      room.blackId = 0;
    }

    // Notify opponent
    const otherWs = color === "w" ? room.black : room.white;
    if (otherWs?.readyState === WebSocket.OPEN) {
      send(otherWs, { type: "opponent_left" });
    }

    // If room is empty, delete it
    if (!room.white && !room.black) {
      rooms.delete(code);
      console.log(`Room ${code} deleted (empty)`);
    }
  }

  wsToRoom.delete(ws);
}

// ── HTTP + WebSocket server ───────────────────────────────
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  console.log("New connection");

  ws.on("message", (data) => handleMessage(ws, data.toString()));

  ws.on("close", () => {
    leaveCurrentRoom(ws);
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server on ws://localhost:${PORT}`);
});
