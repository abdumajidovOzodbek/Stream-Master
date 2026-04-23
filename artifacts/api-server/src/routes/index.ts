import { Router, type IRouter } from "express";
import healthRouter from "./health";
import videosRouter from "../server/videos";
import chatsRouter from "../server/chats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(videosRouter);
router.use(chatsRouter);

export default router;
