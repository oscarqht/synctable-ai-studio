import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

const p = platform();

if (p === "darwin") {
  const result = Bun.spawnSync(["sh", "./scripts/build-dia-db-reader.sh"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) process.exit(result.exitCode);
} else if (p === "win32") {
  const binDir = join(import.meta.dir, "..", "src", "native", "bin");
  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const cscPath64 = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
  const cscPath32 = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe";
  const csc = existsSync(cscPath64) ? cscPath64 : existsSync(cscPath32) ? cscPath32 : "csc.exe";

  const sourceFile = join(import.meta.dir, "..", "src", "native", "win-locked-file-reader", "win-file-reader.cs");
  const outFile = join(binDir, "win-file-reader.exe");

  if (existsSync(sourceFile)) {
    const result = Bun.spawnSync([csc, "/nologo", `/out:${outFile}`, "/target:exe", "/platform:anycpu", sourceFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    if (result.exitCode !== 0) {
      console.warn("[build-native] Warning: Failed to build win-file-reader.exe with csc:", result.exitCode);
    }
  }

  const liveSourceFile = join(import.meta.dir, "..", "src", "native", "win-live-reader", "win-live-reader.cs");
  const liveOutFile = join(binDir, "win-live-reader.exe");
  const wpfDir64 = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\WPF";
  const wpfDir32 = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\WPF";
  const wpfDir = existsSync(wpfDir64) ? wpfDir64 : wpfDir32;
  const uiaClient = join(wpfDir, "UIAutomationClient.dll");
  const uiaTypes = join(wpfDir, "UIAutomationTypes.dll");

  if (existsSync(liveSourceFile)) {
    const args = [csc, "/nologo", `/out:${liveOutFile}`];
    if (existsSync(uiaClient) && existsSync(uiaTypes)) {
      args.push(`/r:${uiaClient},${uiaTypes},System.Management.dll`);
    } else {
      args.push("/r:UIAutomationClient.dll,UIAutomationTypes.dll,System.Management.dll");
    }
    args.push("/target:exe", "/platform:anycpu", liveSourceFile);


    const result = Bun.spawnSync(args, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    if (result.exitCode !== 0) {
      console.warn("[build-native] Warning: Failed to build win-live-reader.exe with csc:", result.exitCode);
    }
  }
}


