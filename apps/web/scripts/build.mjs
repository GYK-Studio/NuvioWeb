import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(appDir, "../..");
const distDir = path.join(appDir, "dist");
const debug = process.env.NODE_ENV !== "production";
const appPackage = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));

await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "assets", "libs"), { recursive: true });

await Promise.all([
  cp(path.join(appDir, "index.html"), path.join(distDir, "index.html")),
  cp(path.join(rootDir, "assets"), path.join(distDir, "assets"), { recursive: true }),
  cp(path.join(rootDir, "res"), path.join(distDir, "res"), { recursive: true }),
  cp(path.join(rootDir, "LICENSE"), path.join(distDir, "LICENSE")),
  build({
    entryPoints: [path.join(appDir, "src", "app.js")],
    outfile: path.join(distDir, "app.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    sourcemap: debug,
    minify: !debug,
    define: {
      "process.env.NODE_ENV": JSON.stringify(debug ? "development" : "production"),
      __NUVIO_APP_VERSION__: JSON.stringify(appPackage.version)
    }
  }),
  build({
    entryPoints: [path.join(appDir, "src", "styles", "index.css")],
    outfile: path.join(distDir, "app.css"),
    bundle: true,
    minify: !debug
  })
]);

await Promise.all([
  cp(
    path.join(rootDir, "node_modules", "hls.js", "dist", "hls.min.js"),
    path.join(distDir, "assets", "libs", "hls.min.js")
  ),
  cp(
    path.join(rootDir, "node_modules", "dashjs", "dist", "dash.all.min.js"),
    path.join(distDir, "assets", "libs", "dash.all.min.js")
  ),
  cp(
    path.join(rootDir, "node_modules", "assjs", "dist", "ass.global.min.js"),
    path.join(distDir, "assets", "libs", "ass.min.js")
  )
]);

const envSource = await readFile(path.join(rootDir, "dist", "nuvio.env.js"), "utf8").catch(
  () => "globalThis.NUVIO_ENV = {};\n"
);
await writeFile(path.join(distDir, "nuvio.env.js"), envSource);
console.log(`Nuvio apps/web build complete: ${distDir}`);
