import { Router, type IRouter } from "express";
import healthRouter from "./health";
import videosRouter from "../server/videos";
import chatsRouter from "../server/chats";
import authRouter from "../server/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(videosRouter);
router.use(chatsRouter);

export default router;
