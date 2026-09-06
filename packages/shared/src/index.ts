import z from "zod";

// ── Auth schemas ──────────────────────────────────────────
export const signupSchema = z.object({
  name: z.string().min(2),
  username: z.string().email(),
  password: z.string().min(2).max(12),
});

export const signinSchema = z.object({
  username: z.string().email(),
  password: z.string().min(2).max(12),
});

// ── Game types ────────────────────────────────────────────
export type Color = "w" | "b";

export type GameResult =
  | "1-0"
  | "0-1"
  | "1/2-1/2"
  | null;

// ── WebSocket messages ────────────────────────────────────

// Client → Server
export type ClientMessage =
  | { type: "create_room"; token: string }
  | { type: "join_room"; code: string; token: string }
  | { type: "leave_room" }
  | { type: "move"; code: string; move: string }
  | { type: "resign"; code: string };

// Server → Client
export type ServerMessage =
  | { type: "room_created"; code: string; color: "w" }
  | { type: "room_joined"; code: string; color: Color; fen: string; opponent: string | null }
  | { type: "opponent_joined"; opponent: string }
  | { type: "game_started"; fen: string; white: string; black: string }
  | { type: "move_made"; move: string; fen: string; turn: Color; by: Color }
  | { type: "invalid_move"; reason: string; fen: string }
  | { type: "game_over"; result: GameResult; reason: string }
  | { type: "opponent_left" }
  | { type: "opponent_resigned"; winner: Color }
  | { type: "error"; message: string };
