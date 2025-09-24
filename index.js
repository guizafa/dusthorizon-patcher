import express from "express";
import morgan from "morgan";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import router from "./routes/index.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// middlewares
app.use(cors({ origin: "*" }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));

// rotas
app.use(router);

// erros
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something broke!");
});

// start
const PORT = process.env.API_PORT || 4000;
server.listen(PORT, () => {
  console.log("DH Patcher listening on port " + PORT);
});
