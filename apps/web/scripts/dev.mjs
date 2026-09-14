import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = spawn(process.execPath, [path.join(appDir, "scripts", "build.mjs")], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" }
});
build.on("exit", (code) => {
  if (code) process.exit(code);
  const server = spawn(process.execPath, [path.join(appDir, "scripts", "serve.mjs")], {
    stdio: "inherit"
  });
  server.on("exit", (serverCode) => process.exit(serverCode || 0));
});
