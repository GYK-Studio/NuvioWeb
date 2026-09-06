import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readAppMetadata } from "./appMetadata.mjs";
import { writeRuntimeEnvScriptFile } from "./envProperties.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const debugBundle = /^(1|true|yes|on)$/i.test(String(process.env.NUVIO_DEBUG_BUNDLE || ""));
const requireConfiguredRuntimeEnv = /^(1|true|yes|on)$/i.test(
  String(process.env.NUVIO_REQUIRE_LOCAL_PROPERTIES || "")
);

async function copyLibraryAssets() {
  const libraryDir = path.join(distDir, "assets", "libs");
  await mkdir(libraryDir, { recursive: true });
  await Promise.all([
    cp(
      path.join(rootDir, "node_modules", "hls.js", "dist", "hls.min.js"),
      path.join(libraryDir, "hls.min.js")
    ),
    cp(
      path.join(rootDir, "node_modules", "dashjs", "dist", "dash.all.min.js"),
      path.join(libraryDir, "dash.all.min.js")
    ),
    cp(
      path.join(rootDir, "node_modules", "assjs", "dist", "ass.global.min.js"),
      path.join(libraryDir, "ass.min.js")
    ),
    cp(
      path.join(rootDir, "node_modules", "libbitsub", "pkg", "libbitsub_bg.wasm"),
      path.join(libraryDir, "libbitsub_bg.wasm")
    ),
    cp(
      path.join(rootDir, "node_modules", "quickjs-emscripten", "dist", "index.global.js"),
      path.join(libraryDir, "quickjs-emscripten.global.js")
    )
  ]);
}

async function buildPluginWorker() {
  const cryptoJsSource = await readFile(
    path.join(rootDir, "node_modules", "crypto-js", "crypto-js.js"),
    "utf8"
  );
  await build({
    entryPoints: [path.join(rootDir, "js", "core", "player", "pluginWorker.js")],
    outfile: path.join(distDir, "assets", "runtime", "plugin-worker.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: !debugBundle,
    legalComments: "none",
    define: { __NUVIO_CRYPTO_JS_SOURCE__: JSON.stringify(cryptoJsSource) }
  });
}

async function runBuild() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const { version } = await readAppMetadata();
  await Promise.all([
    cp(path.join(rootDir, "assets"), path.join(distDir, "assets"), { recursive: true }),
    cp(path.join(rootDir, "css"), path.join(distDir, "css"), { recursive: true }),
    cp(path.join(rootDir, "res"), path.join(distDir, "res"), { recursive: true }),
    cp(path.join(rootDir, "docs", "youtube-proxy.html"), path.join(distDir, "youtube-proxy.html")),
    cp(path.join(rootDir, "index.html"), path.join(distDir, "index.html"))
  ]);

  await Promise.all([
    build({
      entryPoints: [path.join(rootDir, "js", "app.js")],
      outfile: path.join(distDir, "app.bundle.js"),
      bundle: true,
      format: "iife",
      target: "es2022",
      minify: !debugBundle,
      sourcemap: debugBundle,
      legalComments: "none",
      define: {
        "process.env.NODE_ENV": '"production"',
        __NUVIO_APP_VERSION__: JSON.stringify(version)
      }
    }),
    buildPluginWorker(),
    copyLibraryAssets()
  ]);

  const envResult = await writeRuntimeEnvScriptFile(path.join(distDir, "nuvio.env.js"), {
    rootDir
  });
  if (requireConfiguredRuntimeEnv && !envResult.sourcePath) {
    throw new Error(
      "Configured runtime env is required. Provide local.properties or NUVIO_LOCAL_PROPERTIES."
    );
  }
  console.log(`Nuvio Web build complete: ${distDir}`);
}

runBuild().catch((error) => {
  console.error("Nuvio Web build failed", error);
  process.exit(1);
});
