import { Router, type IRouter } from "express";
import healthRouter from "./health";
import videosRouter from "../server/videos";
import chatsRouter from "../server/chats";
import authRouter from "../server/auth";
import adminRouter from "../server/admin";
import updatesRouter from "../server/updates";
import eventsRouter from "../server/events";
import settingsRouter from "../server/settings";
import statsRouter from "../server/stats";
import { sessionMiddleware } from "../middlewares/session";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionMiddleware as never);
router.use(authRouter);
router.use(eventsRouter);
router.use(videosRouter);
router.use(chatsRouter);
router.use(adminRouter);
router.use(updatesRouter);
router.use(settingsRouter);
router.use(statsRouter);

export default router;
