// routes/patch.js
import fs from "fs";
import path from "path";
import XXH from "xxhashjs";

const MAX_CONCURRENT = 32;

// checksums.json vai ficar na pasta onde você dá "cd" (C:\DustHorizon\patcher)
const CHECKSUM_FILE = path.join(process.cwd(), "checksums.json");

// Lê toda a árvore de arquivos a partir da raiz
function listFilesRecursive(root) {
  let files = [];
  const items = fs.readdirSync(root, { withFileTypes: true });

  for (const i of items) {
    const fullPath = path.join(root, i.name);
    if (i.isDirectory()) {
      files = files.concat(listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

// ✅ normaliza e garante XXH64 em hex com 16 chars (padding)
function toHex64Padded(v) {
  const hex = v.toString(16).toLowerCase();
  return hex.padStart(16, "0");
}

// Calcula o XXHash de um arquivo usando stream
function calcXXHashHex(filePath) {
  return new Promise((resolve, reject) => {
    const h = XXH.h64(0xcafebabe);
    const s = fs.createReadStream(filePath);

    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => {
      try {
        const digest = toHex64Padded(h.digest()); // ✅ padded
        resolve(digest);
      } catch (err) {
        reject(err);
      }
    });
    s.on("error", (err) => reject(err));
  });
}

// Tenta carregar checksums de um cache existente
function loadChecksumsFromCache(rootDir) {
  if (!fs.existsSync(CHECKSUM_FILE)) return null;

  try {
    const raw = fs.readFileSync(CHECKSUM_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (parsed.rootDir !== rootDir || !Array.isArray(parsed.files)) {
      console.warn(
        "checksums.json incompatível com rootDir atual, ignorando cache."
      );
      return null;
    }

    console.log(
      `Checksums carregados do cache (${parsed.files.length} arquivos, gerado em ${parsed.generatedAt}).`
    );

    return parsed.files;
  } catch (err) {
    console.error("Erro ao ler checksums.json, ignorando cache:", err);
    return null;
  }
}

// Salva os checksums novos em cache
function saveChecksumsToCache(rootDir, pairs) {
  try {
    const payload = {
      rootDir,
      generatedAt: new Date().toISOString(),
      files: pairs, // [rel, hash, size, mtimeMs]
    };
    fs.writeFileSync(CHECKSUM_FILE, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Checksums salvos em ${CHECKSUM_FILE}.`);
  } catch (err) {
    console.error("Erro ao salvar checksums.json:", err);
  }
}

// forceRebuild=true -> ignora cache e recalcula tudo
export async function initChecksums(rootDir, { forceRebuild = false } = {}) {
  global.DH_PATCH_ROOT = rootDir;

  // 1) Tenta carregar cache existente
  let cachedMap = null;
  if (!forceRebuild) {
    const cached = loadChecksumsFromCache(rootDir);
    if (cached) {
      cachedMap = new Map();
      for (const entry of cached) {
        // entry: [rel, hash, size, mtimeMs]
        const [rel, hash, size, mtimeMs] = entry;

        // ✅ garante que mesmo cache antigo fique padded
        const fixedHash =
          typeof hash === "string"
            ? hash.toLowerCase().padStart(16, "0")
            : String(hash ?? "").toLowerCase().padStart(16, "0");

        cachedMap.set(rel, { hash: fixedHash, size, mtimeMs });
      }
    }
  }

  // 2) Lista arquivos atuais da raiz
  const absFiles = listFilesRecursive(rootDir);
  const total = absFiles.length;

  console.log(`Encontrados ${total} arquivos para indexar...`);
  console.time("checksums");
  const startTime = Date.now();

  const entries = absFiles.map((abs, idx) => {
    const stat = fs.statSync(abs);
    const rel = path.relative(rootDir, abs).split(path.sep).join("/");

    return {
      index: idx,
      abs,
      rel,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  });

  const pairs = new Array(total);
  let processed = 0;

  // 3) Reaproveita do cache o que não mudou
  const toHash = [];
  if (cachedMap) {
    for (const entry of entries) {
      const cached = cachedMap.get(entry.rel);
      if (
        cached &&
        typeof cached.size === "number" &&
        typeof cached.mtimeMs === "number" &&
        cached.size === entry.size &&
        cached.mtimeMs === entry.mtimeMs
      ) {
        pairs[entry.index] = [entry.rel, cached.hash, entry.size, entry.mtimeMs];
        processed++;
      } else {
        toHash.push(entry);
      }
    }
  } else {
    for (const entry of entries) toHash.push(entry);
  }

  console.log(
    `Arquivos para recalcular hash: ${toHash.length} / ${total} (o resto usa cache).`
  );

  // 4) Processa em paralelo apenas os que precisam de hash
  let workIndex = 0;

  async function worker() {
    while (true) {
      const myIndex = workIndex++;
      if (myIndex >= toHash.length) return;

      const entry = toHash[myIndex];

      try {
        const hex = await calcXXHashHex(entry.abs); // ✅ padded
        pairs[entry.index] = [entry.rel, hex, entry.size, entry.mtimeMs];

        const done = ++processed;
        const elapsedMs = Date.now() - startTime;
        const elapsedSec = elapsedMs / 1000;

        let etaStr = "";
        let percentStr = "";
        if (done > 0) {
          const percent = (done / total) * 100;
          const avgPerFile = elapsedMs / done;
          const remainingMs = avgPerFile * (total - done);
          const remainingSec = remainingMs / 1000;

          percentStr = percent.toFixed(1) + "%";

          const remMin = Math.floor(remainingSec / 60);
          const remSec = Math.floor(remainingSec % 60);
          etaStr = `ETA ~${remMin}m ${remSec}s`;
        }

        if (done === 1 || done % 200 === 0 || done === total) {
          console.log(
            `Processados ${done}/${total} arquivos ` +
              (percentStr ? `(${percentStr}) ` : "") +
              `| Decorridos ~${elapsedSec.toFixed(1)}s ` +
              (etaStr ? `| ${etaStr}` : "")
          );
        }
      } catch (err) {
        console.error(`Erro ao processar arquivo: ${entry.abs}`, err);
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT, toHash.length || 1);
  const workers = [];
  for (let i = 0; i < workerCount; i++) workers.push(worker());

  await Promise.all(workers);

  console.timeEnd("checksums");

  const finalPairs = pairs.filter(Boolean);

  global.checksums = finalPairs;
  console.log(`Checksums prontos: ${finalPairs.length} arquivos.`);

  // 5) Salva no cache
  saveChecksumsToCache(rootDir, finalPairs);

  return finalPairs;
}

export function getPatchChecksum(req, res) {
  const lines = (global.checksums || [])
    .map(([rel, hex]) => `${rel}=${String(hex).toLowerCase().padStart(16, "0")}`)
    .join("\n");

  res
    .status(200)
    .type("text/plain")
    .set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    .set("Pragma", "no-cache")
    .set("Expires", "0")
    .send(lines);
}

