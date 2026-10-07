import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const target = process.argv[2] || process.env.TAURI_ENV_TARGET_TRIPLE || execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
const suffix = process.platform === "win32" ? ".exe" : "";
const manifest = resolve(root, "Tools/sonic-analyzer/Cargo.toml");
const destination = resolve(root, "src-tauri/binaries");
mkdirSync(destination, { recursive: true });
function build(triple) {
  execFileSync("cargo", ["build", "--locked", "--release", "--manifest-path", manifest, "--target", triple], { cwd: root, stdio: "inherit" });
  return resolve(root, `Tools/sonic-analyzer/target/${triple}/release/music-sonic-analyzer${suffix}`);
}
if (target === "universal-apple-darwin") {
  const arm = build("aarch64-apple-darwin");
  const intel = build("x86_64-apple-darwin");
  execFileSync("lipo", ["-create", arm, intel, "-output", resolve(destination, `music-sonic-analyzer-${target}`)], { stdio: "inherit" });
} else {
  copyFileSync(build(target), resolve(destination, `music-sonic-analyzer-${target}${suffix}`));
}
