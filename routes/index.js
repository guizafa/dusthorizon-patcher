import express from "express";
import { getPatchChecksum } from "./patch.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res
    .status(200)
    .type("text/plain")
    .set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    .set("Pragma", "no-cache")
    .set("Expires", "0")
    .send("OK");
});

router.get("/patch", getPatchChecksum);

export default router;
