import express from "express";
import morgan from "morgan";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import router from "./routes/index.js";
import { initChecksums } from "./routes/patch.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

app.set("etag", false);
app.use(cors({ origin: "*" }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));

const list = await initChecksums("C:/DustHorizon/Game");

if (!list || list.length === 0) {
  throw new Error(
    "Checksums init returned 0 files. Aborting server start to avoid empty /patch."
  );
}

app.use(router);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something broke!");
});

const PORT = process.env.API_PORT || 4000;
server.listen(PORT, () => {
  console.log("DH Patcher listening on port " + PORT);
});
