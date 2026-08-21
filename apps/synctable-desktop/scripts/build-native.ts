import { platform } from "node:os";

// The helper binaries use Apple frameworks and are only needed for Dia and
// macOS lifecycle monitoring. Do not invoke the POSIX/macOS build script on
// Windows or Linux.
if (platform() === "darwin") {
  const result = Bun.spawnSync(["sh", "./scripts/build-dia-db-reader.sh"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) process.exit(result.exitCode);
}
