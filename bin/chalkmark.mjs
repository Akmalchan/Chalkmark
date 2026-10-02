#!/usr/bin/env node
// Launcher: runs the TypeScript CLI through tsx with this repo's tsconfig (path aliases), from any folder.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsx = createRequire(import.meta.url).resolve("tsx/cli");
const child = spawn(process.execPath, [tsx, "--tsconfig", path.join(root, "tsconfig.json"), path.join(root, "cli", "chalkmark.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 1));
