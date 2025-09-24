import express from "express";
import * as patch from "./patch.js";

const router = express.Router();

// inicializa checksums ao subir
await patch.initChecksums("C:/DustHorizon/patch");

router.get("/patch", patch.getPatchChecksum);
router.get("/files/*", (req, res) =>
  patch.getPatchFile(req, res, "C:/DustHorizon/patch")
);

export default router;
