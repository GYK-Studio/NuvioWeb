import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync
} from "node:fs";
import { dirname } from "node:path";
export function attachStorage(core, file) {
  if (!file) return;
  core.auditDays = Math.max(1, Math.min(30, Number(process.env.REMOTE_AUDIT_DAYS) || 7));
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    core.importRecords(Array.isArray(data) ? data : data.sessions);
    core.audit = (Array.isArray(data.audit) ? data.audit : [])
      .filter(
        (event) => Number.isFinite(event.at) && event.at >= core.now() - core.auditDays * 86400000
      )
      .slice(-20000);
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Remote storage unreadable; refusing to start");
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  core.changed = () => {
    const fd = openSync(`${file}.tmp`, "w", 0o600);
    try {
      writeFileSync(
        fd,
        JSON.stringify({ version: 1, sessions: core.exportRecords(), audit: core.audit })
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(`${file}.tmp`, file);
    const directory = openSync(dirname(file), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  };
  core.changed();
}
