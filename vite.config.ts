import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Estampa la versión de package.json en el nombre del caché del service worker.
 * Sin esto, un deploy sin bump manual dejaba a las PWA instaladas congeladas en
 * el bundle viejo (cache-first jamás revalida): pasó con el hold-to-upgrade de
 * la v1.3.1, que nunca llegó a los usuarios con la app instalada.
 */
function swCacheStamp(): Plugin {
  return {
    name: "sw-cache-stamp",
    closeBundle() {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string };
      const swPath = resolve(process.cwd(), "dist/sw.js");
      const src = readFileSync(swPath, "utf8");
      const out = src.replace(/const CACHE = "[^"]+";/, `const CACHE = "tiny-harbor-v${pkg.version}";`);
      if (out === src) throw new Error("sw-cache-stamp: no se encontró la constante CACHE en dist/sw.js");
      writeFileSync(swPath, out);
    },
  };
}

export default defineConfig({
  plugins: [swCacheStamp()],
});
