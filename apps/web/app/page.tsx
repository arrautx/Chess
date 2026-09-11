"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import type { ClientMessage, ServerMessage, Color, GameResult } from "@repo/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Check, Copy, Crown, Loader2, LogOut, RotateCcw, Swords, Trophy } from "lucide-react";

type Phase = "auth" | "lobby" | "waiting" | "playing" | "gameover";

type MyGame = {
  id: number;
  status: string;
  result: string | null;
  whitePlayerName: string | null;
  blackPlayerName: string | null;
  createdAt: string;
};

export default function ChessGame() {
  // ── Auth ──────────────────────────────────────────────
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Game ──────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("auth");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [turn, setTurn] = useState<Color>("w");
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [gameOverReason, setGameOverReason] = useState("");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [myGames, setMyGames] = useState<MyGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const API = "http://localhost:4000";

  // ── Fetch my games ────────────────────────────────────
  const fetchMyGames = useCallback(async () => {
    if (!token) return;
    setGamesLoading(true);
    try {
      const res = await fetch(`${API}/api/game/my-games`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { games?: MyGame[] };
      if (res.ok) {
        setMyGames(data.games ?? []);
      }
    } catch {
      // silently ignore; games list is non-critical
    } finally {
      setGamesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (phase === "lobby") {
      fetchMyGames();
    }
  }, [phase, fetchMyGames]);

  // ── Auth handler ──────────────────────────────────────
  const handleAuth = async () => {
    if (authLoading) return;
    setAuthError("");
    if (authMode === "signup" && !authForm.name.trim()) {
      setAuthError("Please enter your name");
      return;
    }
    if (!authForm.email.trim() || !authForm.password) {
      setAuthError("Please fill in all fields");
      return;
    }
    setAuthLoading(true);
    const endpoint = authMode === "signup" ? "/signup" : "/signin";
    const body =
      authMode === "signup"
        ? { name: authForm.name, username: authForm.email, password: authForm.password }
        : { username: authForm.email, password: authForm.password };

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { message?: string; token?: string; user?: { username: string } };
      if (!res.ok) {
        setAuthError(data.message || "Auth failed");
        return;
      }
      if (data.token && data.user) {
        setToken(data.token);
        setUsername(data.user.username);
        setPhase("lobby");
      }
    } catch {
      setAuthError("Cannot reach server");
    } finally {
      setAuthLoading(false);
    }
  };

  // ── WS message handler ────────────────────────────────
  const onMessage = useCallback(
    (e: MessageEvent) => {
      const msg: ServerMessage = JSON.parse(e.data);

      switch (msg.type) {
        case "room_created":
          setRoomCode(msg.code);
          setMyColor(msg.color);
          setPhase("waiting");
          break;

        case "room_joined":
          setRoomCode(msg.code);
          setMyColor(msg.color);
          setFen(msg.fen);
          if (msg.opponent) setOpponentName(msg.opponent);
          setPhase("waiting");
          break;

        case "opponent_joined":
          setOpponentName(msg.opponent);
          break;

        case "game_started":
          setFen(msg.fen);
          setOpponentName((p) => p || "Opponent");
          setPhase("playing");
          break;

        case "move_made":
          setFen(msg.fen);
          setTurn(msg.turn);
          setMoveHistory((p) => [...p, `${msg.by === "w" ? "♔" : "♚"} ${msg.move}`]);
          break;

        case "invalid_move":
          setFen(msg.fen);
          setError(msg.reason);
          setTimeout(() => setError(""), 2000);
          break;

        case "game_over":
          setPhase("gameover");
          setGameResult(msg.result);
          setGameOverReason(msg.reason);
          break;

        case "opponent_left":
          setError("Opponent disconnected");
          break;

        case "opponent_resigned":
          setPhase("gameover");
          setGameResult(msg.winner === myColor ? "1-0" : "0-1");
          setGameOverReason(
            msg.winner === myColor ? "Opponent resigned" : "You resigned"
          );
          break;

        case "error":
          setError(msg.message);
          setTimeout(() => setError(""), 3000);
          break;
      }
    },
    [myColor]
  );

  // ── Connect WS ────────────────────────────────────────
  const connectWs = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }
        const ws = new WebSocket("ws://localhost:4001");
        wsRef.current = ws;
        ws.onopen = () => resolve();
        ws.onmessage = onMessage;
        ws.onclose = () => console.log("WS closed");
        ws.onerror = () => setError("WebSocket connection failed");
      }),
    [onMessage]
  );

  // ── Create room ───────────────────────────────────────
  const createRoom = async () => {
    await connectWs();
    const msg: ClientMessage = { type: "create_room", token: token! };
    wsRef.current!.send(JSON.stringify(msg));
  };

  // ── Join room ─────────────────────────────────────────
  const joinRoom = async () => {
    if (!joinCode.trim()) {
      setError("Enter a room code");
      return;
    }
    await connectWs();
    const msg: ClientMessage = {
      type: "join_room",
      code: joinCode.trim().toUpperCase(),
      token: token!,
    };
    wsRef.current!.send(JSON.stringify(msg));
  };

  // ── Make move ─────────────────────────────────────────
  const onDrop = (sourceSquare: Square, targetSquare: Square) => {
    if (!roomCode || !myColor || phase !== "playing") return false;

    // chess.js v1.x THROWS on illegal moves (v0.x returned null) —
    // so validate with try/catch instead of checking the result.
    try {
      const chess = new Chess(fen);
      const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });

      const msg: ClientMessage = { type: "move", code: roomCode, move: move.san };
      wsRef.current?.send(JSON.stringify(msg));
      return true;
    } catch {
      // Illegal move — return false so the piece snaps back to its square
      return false;
    }
  };

  // ── Resign ────────────────────────────────────────────
  const resign = () => {
    if (!roomCode) return;
    const msg: ClientMessage = { type: "resign", code: roomCode };
    wsRef.current?.send(JSON.stringify(msg));
  };

  // ── Leave room ────────────────────────────────────────
  const leaveRoom = () => {
    const msg: ClientMessage = { type: "leave_room" };
    wsRef.current?.send(JSON.stringify(msg));
    resetGameState();
  };

  // ── Logout ────────────────────────────────────────────
  const logout = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setToken(null);
    setUsername("");
    resetGameState();
    setPhase("auth");
  };

  // ── Back to lobby ─────────────────────────────────────
  const backToLobby = () => {
    wsRef.current?.close();
    wsRef.current = null;
    resetGameState();
  };

  const resetGameState = () => {
    setPhase("lobby");
    setRoomCode("");
    setJoinCode("");
    setMyColor(null);
    setFen(new Chess().fen());
    setTurn("w");
    setOpponentName(null);
    setGameResult(null);
    setGameOverReason("");
    setMoveHistory([]);
    setError("");
  };

  // ── Cleanup ───────────────────────────────────────────
  useEffect(() => () => wsRef.current?.close(), []);

  // ── Copy room code ────────────────────────────────────
  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  // ── Auth ──────────────────────────────────────────────
  if (phase === "auth") {
    return (
      <div className="page-bg min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl shadow-black/60 animate-fade-up">
          <CardHeader className="items-center text-center pb-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-3xl shadow-lg mb-3">
              ♟
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">Chess</CardTitle>
            <CardDescription>
              {authMode === "signin" ? "Sign in to your account" : "Create a new account"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authMode === "signup" && (
              <Input
                placeholder="Name"
                autoFocus
                value={authForm.name}
                onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
              />
            )}
            <Input
              placeholder="Email"
              type="email"
              autoFocus={authMode === "signin"}
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
            />
            <Input
              placeholder="Password"
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            />

            {authError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {authError}
              </div>
            )}

            <Button className="w-full" onClick={handleAuth} disabled={authLoading}>
              {authLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {authLoading ? "Please wait…" : authMode === "signin" ? "Sign In" : "Sign Up"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              {authMode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                className="font-medium text-primary hover:underline"
                onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              >
                {authMode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Lobby ─────────────────────────────────────────────
  if (phase === "lobby") {
    const resultBadge = (g: MyGame) => {
      if (!g.result) return null;
      if (g.result === "1/2-1/2")
        return <Badge variant="outline" className="text-muted-foreground">Draw</Badge>;
      const won =
        (g.result === "1-0" && g.whitePlayerName === username) ||
        (g.result === "0-1" && g.blackPlayerName === username);
      return won ? (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30" variant="outline">Won</Badge>
      ) : (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/30" variant="outline">Lost</Badge>
      );
    };

    return (
      <div className="page-bg min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl shadow-black/60 animate-fade-up">
          <CardHeader className="items-center text-center pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-2xl shadow-lg mb-2">
              ♟
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Chess</CardTitle>
            <CardDescription>Welcome back, {username}</CardDescription>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 gap-1 text-muted-foreground hover:text-foreground"
              onClick={logout}
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full gap-2 h-11" onClick={createRoom}>
              <Crown className="h-4 w-4" />
              Create Room
            </Button>

            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
              <Separator className="flex-1" />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="font-mono tracking-[0.2em] uppercase"
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              />
              <Button variant="secondary" className="gap-1.5" onClick={joinRoom}>
                <Swords className="h-4 w-4" />
                Join
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-3">My Recent Games</h3>
              {gamesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : myGames.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Swords className="h-6 w-6" />
                  <p className="text-sm">No games yet — start your first one above</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {myGames.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {g.whitePlayerName ?? "?"} vs {g.blackPlayerName ?? "?"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(g.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={g.status === "waiting" ? "secondary" : "default"}>
                          {g.status}
                        </Badge>
                        {resultBadge(g)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Waiting ───────────────────────────────────────────
  if (phase === "waiting") {
    return (
      <div className="page-bg min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-2xl shadow-black/60 animate-fade-up">
          <CardHeader className="items-center">
            <CardTitle className="flex items-center justify-center gap-2">
              Waiting for opponent
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/70 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/70 animate-pulse [animation-delay:200ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/70 animate-pulse [animation-delay:400ms]" />
              </span>
            </CardTitle>
            <CardDescription>Share this code with a friend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              onClick={copyCode}
              className="group w-full rounded-xl border bg-card p-6 transition-all hover:border-foreground/40 hover:bg-accent active:scale-[0.98]"
            >
              <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Room Code
              </span>
              <span className="block text-4xl font-bold tracking-[0.2em] transition-colors group-hover:text-primary">
                {roomCode}
              </span>
              <span className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  "click to copy"
                )}
              </span>
            </button>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button variant="outline" className="w-full gap-2" onClick={leaveRoom}>
              <LogOut className="h-4 w-4" />
              Leave
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Game Over ─────────────────────────────────────────
  if (phase === "gameover") {
    const won = gameResult === "1/2-1/2" ? null : (gameResult === "1-0" && myColor === "w") || (gameResult === "0-1" && myColor === "b");

    return (
      <div className="page-bg min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center shadow-2xl shadow-black/60 animate-fade-up">
          <CardHeader className="items-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full border mb-2 ${
                won === null
                  ? "border-border bg-muted text-muted-foreground"
                  : won
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {won === null ? <Swords className="h-7 w-7" /> : <Trophy className="h-7 w-7" />}
            </div>
            <CardTitle className="text-2xl">
              {won === null ? "Draw" : won ? "You Win!" : "You Lose"}
            </CardTitle>
            <CardDescription>
              {gameResult === "1/2-1/2"
                ? "The game ended in a draw"
                : gameResult === "1-0"
                ? "White wins"
                : "Black wins"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{gameOverReason}</p>
            <Button className="w-full gap-2 h-11" onClick={backToLobby}>
              <RotateCcw className="h-4 w-4" />
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Playing ───────────────────────────────────────────
  const isMyTurn = turn === myColor;

  const playerDot = (color: Color | null) => (
    <span
      className="h-3 w-3 rounded-full border border-white/40 shrink-0"
      style={{
        backgroundColor: color === "w" ? "#e9e9e9" : "#1a1a1a",
      }}
    />
  );

  return (
    <div className="page-bg min-h-screen p-4 flex flex-col items-center gap-4">
      <Card className="w-full max-w-[560px]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {playerDot(myColor === "w" ? "b" : "w")}
              <span className="text-sm font-medium">
                {opponentName || "Opponent"} ({myColor === "w" ? "Black" : "White"})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono tracking-wider">
                {roomCode}
              </Badge>
              <Badge variant={isMyTurn ? "default" : "secondary"}>
                {isMyTurn ? "Your turn" : "Waiting..."}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                onClick={logout}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative w-full max-w-[560px]">
        <Chessboard
          options={{
            position: fen,
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              onDrop(sourceSquare as Square, targetSquare as Square),
            boardOrientation: myColor === "b" ? "black" : "white",
            animationDurationInMs: 200,
            allowDragging: phase === "playing" && isMyTurn,
            boardStyle: {
              borderRadius: "0.75rem",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            },
            // Classic brown/cream scheme — black & white pieces stay visible on both squares
            darkSquareStyle: { backgroundColor: "#b58863" },
            lightSquareStyle: { backgroundColor: "#f0d9b5" },
          }}
        />
        {error && (
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-1.5 rounded-md text-sm whitespace-nowrap shadow-lg">
            {error}
          </div>
        )}
      </div>

      <Card className="w-full max-w-[560px]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {playerDot(myColor)}
              <span className="text-sm font-medium">
                {username} ({myColor === "w" ? "White" : "Black"})
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resign}
              className="border-white text-white hover:bg-white hover:text-black"
            >
              Resign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-[560px]">
        <CardContent className="p-4">
          {moveHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moves yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {moveHistory.map((m, i) => (
                <Badge key={i} variant="secondary">
                  {m}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
