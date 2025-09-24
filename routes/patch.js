import fs from "fs";
import XXH from "xxhashjs";

function listFilesRecursive(root) {
  let files = [];
  const items = fs.readdirSync(root, { withFileTypes: true });
  for (const i of items) {
    if (i.isDirectory())
      files = files.concat(listFilesRecursive(`${root}/${i.name}`));
    else files.push(`${root}/${i.name}`);
  }
  return files;
}
function calcXXHashHex(filePath) {
  return new Promise((resolve, reject) => {
    const h = XXH.h64(0xcafebabe);
    const s = fs.createReadStream(filePath);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolve(h.digest().toString(16))); // hex
    s.on("error", reject);
  });
}

export async function initChecksums(rootDir) {
  global.DH_PATCH_ROOT = rootDir; // salva raiz
  const files = listFilesRecursive(rootDir);
  const pairs = await Promise.all(
    files.map(async (abs) => {
      const rel = abs.replace(rootDir + "/", "").replaceAll("\\", "/");
      const hex = await calcXXHashHex(abs);
      return [rel, hex];
    })
  );
  global.checksums = pairs; // array de [rel, hash]
  console.log(`Checksums prontos: ${pairs.length} arquivos.`);
  return pairs;
}

export function getPatchChecksum(req, res) {
  const lines = (global.checksums || [])
    .map(([rel, hex]) => `${rel}=${hex}`)
    .join("\n");
  res.type("text/plain").send(lines);
}

export function getPatchFile(req, res, root) {
  const rel = req.path.replace("/files/", "");
  // garante que consta no checksum
  const ok = (global.checksums || []).some(
    ([p]) => p.toLowerCase() === rel.toLowerCase()
  );
  if (!ok) return res.status(404).send("File not found");
  res.sendFile(rel, { root });
}
