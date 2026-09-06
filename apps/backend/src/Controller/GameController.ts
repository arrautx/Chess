import { type Request, type Response } from "express";
import {
  createGame,
  findGameById,
  findWaitingGames,
  findGamesByUser,
  joinGame,
  type Game,
  type User,
} from "@repo/db";
import type { AuthRequest } from "../../lib/jwt";

export const createNewGame = async function (req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const username = req.user!.username;

    const game = await createGame(userId, username);

    res.status(201).json({
      message: "Game created. Waiting for opponent.",
      game: formatGame(game),
    });
  } catch (error) {
    console.error("Create game error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const joinExistingGame = async function (req: AuthRequest, res: Response) {
  const gameId = Number(req.params.id);
  if (isNaN(gameId)) {
    res.status(400).json({ message: "Invalid game ID" });
    return;
  }

  try {
    const game = await findGameById(gameId);

    if (!game) {
      res.status(404).json({ message: "Game not found" });
      return;
    }
    if (game.status !== "waiting") {
      res.status(409).json({ message: "Game is not waiting for players" });
      return;
    }

    const userId = req.user!.userId;
    const username = req.user!.username;

    if (game.whitePlayerId === userId) {
      res.status(400).json({ message: "You cannot join your own game" });
      return;
    }

    const updated = await joinGame(gameId, userId, username);

    res.status(200).json({
      message: "Joined game successfully",
      game: formatGame(updated),
    });
  } catch (error) {
    console.error("Join game error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getGame = async function (req: AuthRequest, res: Response) {
  const gameId = Number(req.params.id);
  if (isNaN(gameId)) {
    res.status(400).json({ message: "Invalid game ID" });
    return;
  }

  try {
    const game = await findGameById(gameId);

    if (!game) {
      res.status(404).json({ message: "Game not found" });
      return;
    }

    res.status(200).json({ game: formatGame(game) });
  } catch (error) {
    console.error("Get game error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const listGames = async function (req: AuthRequest, res: Response) {
  try {
    const games = await findWaitingGames();
    res.status(200).json({
      games: games.map(formatGame),
    });
  } catch (error) {
    console.error("List games error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMyGames = async function (req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const games = await findGamesByUser(userId);
    res.status(200).json({
      games: games.map(formatGame),
    });
  } catch (error) {
    console.error("Get my games error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

function formatGame(game: Game) {
  return {
    id: game.id,
    fen: game.fen,
    whitePlayerId: game.whitePlayerId,
    blackPlayerId: game.blackPlayerId,
    whitePlayerName: game.whitePlayerName,
    blackPlayerName: game.blackPlayerName,
    status: game.status,
    result: game.result,
    turn: game.turn,
    createdAt: game.createdAt.toISOString(),
  };
}
