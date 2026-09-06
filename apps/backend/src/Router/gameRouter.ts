import { Router } from "express";
import { authMiddleware } from "../../lib/jwt";
import {
  createNewGame,
  joinExistingGame,
  getGame,
  listGames,
  getMyGames,
} from "../Controller/GameController";

const gameRouter = Router();

// All game routes require auth
gameRouter.use(authMiddleware);

gameRouter.post("/create", createNewGame);
gameRouter.post("/join/:id", joinExistingGame);
gameRouter.get("/list", listGames);
gameRouter.get("/my-games", getMyGames);
gameRouter.get("/:id", getGame);

export default gameRouter;
