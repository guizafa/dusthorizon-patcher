// routes/index.js
import express from "express";
import * as patch from "./patch.js";

const router = express.Router();

// inicializa checksums da pasta Game ao subir
await patch.initChecksums("C:/DustHorizon/Game");

// rota que devolve os checksums
router.get("/patch", patch.getPatchChecksum);

export default router;
