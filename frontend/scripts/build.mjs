import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next.js assigns NODE_ENV=production only when it is unassigned. This
// workspace exports NODE_ENV=development, which makes `next build` compile in
// the wrong mode, so set it explicitly before invoking the local Next CLI.
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(projectDir, "node_modules", "next", "dist", "bin", "next");

const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: projectDir,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
