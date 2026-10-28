// Builds RocketSim and wasm/bindings.cpp into src/wasm/rocketsim.mjs and its
// .wasm. Object files are cached in build/wasm-obj, so a rebuild only
// compiles what changed. em++ comes from $EMXX, or PATH.

import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const EMXX = process.env.EMXX ?? "em++";
const RS = "vendor/RocketSim";
const OBJ_DIR = "build/wasm-obj";
const OUT = "src/wasm/rocketsim.mjs";

// No -ffast-math: parity with native RocketSim needs IEEE float behaviour.
const COMPILE = ["-O2", "-std=c++20", "-fwasm-exceptions", "-DRS_DONT_LOG", `-I${RS}/src`, `-I${RS}/libsrc`];
const LINK = [
  "-O2",
  "-fwasm-exceptions",
  "-lembind",
  "-sMODULARIZE",
  "-sEXPORT_ES6",
  "-sEXPORT_NAME=createRocketSim",
  "-sENVIRONMENT=web,node",
  "-sALLOW_MEMORY_GROWTH",
];

function cppFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return cppFiles(path);
    return e.name.endsWith(".cpp") ? [path] : [];
  });
}

const sources = [...cppFiles(`${RS}/libsrc/bullet3-3.24`), ...cppFiles(`${RS}/src`), "wasm/bindings.cpp"];
const objects = sources.map((src) => join(OBJ_DIR, relative(".", src).replace(/[\\/]/g, "_").replace(/\.cpp$/, ".o")));
mkdirSync(OBJ_DIR, { recursive: true });
mkdirSync("src/wasm", { recursive: true });

// Headers aren't tracked, so any header change under vendor/ rebuilds everything.
const newestHeader = Math.max(...[`${RS}/src`, `${RS}/libsrc`].flatMap(function headers(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return headers(path);
    return /\.(h|hpp)$/.test(e.name) ? [statSync(path).mtimeMs] : [];
  });
}));
const stale = sources
  .map((src, i) => ({ src, obj: objects[i] }))
  .filter(({ src, obj }) => !existsSync(obj) || statSync(obj).mtimeMs < Math.max(statSync(src).mtimeMs, newestHeader));

let next = 0;
async function worker() {
  while (next < stale.length) {
    const { src, obj } = stale[next++];
    await run(EMXX, [...COMPILE, "-c", src, "-o", obj], { maxBuffer: 1 << 24 });
  }
}
console.log(`compiling ${stale.length} of ${sources.length} files`);
await Promise.all(Array.from({ length: cpus().length }, worker));
await run(EMXX, [...LINK, ...objects, "-o", OUT], { maxBuffer: 1 << 24 });
// src/physics.ts types the module itself; this only lets TypeScript import it.
writeFileSync(OUT.replace(/\.mjs$/, ".d.mts"), "declare const createRocketSim: () => Promise<unknown>;\nexport default createRocketSim;\n");
console.log(`wrote ${OUT}`);
