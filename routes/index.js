import express from "express";
import * as patch from "./patch.js";

const router = express.Router();

// ✅ healthcheck simples (texto puro) + anti-cache total
router.get("/health", (req, res) => {
  res
    .status(200)
    .type("text/plain")
    .set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    .set("Pragma", "no-cache")
    .set("Expires", "0")
    .send("OK");
});

// inicializa checksums da pasta Game ao subir
await patch.initChecksums("C:/DustHorizon/Game");

// rota que devolve os checksums (manifest)
router.get("/patch", patch.getPatchChecksum);

export default router;
