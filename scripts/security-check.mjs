import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const indexHtml = readText("index.html");
const gitignore = readText(".gitignore");

const security = tauriConfig.app?.security ?? {};
const csp = security.csp;
const devCsp = security.devCsp;
const capabilities = security.capabilities;
const cargoVersion = cargoToml.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockPackage = cargoLock.match(/\[\[package\]\]\s+name = "music-library"[\s\S]*?(?=\n\[\[package\]\]|$)/)?.[0];
const cargoLockVersion = cargoLockPackage?.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];

check(packageJson.private === true, "package.json must stay private to prevent accidental registry publishes.");
check(packageJson.version === packageLock.version, "package-lock.json root version must match package.json.");
check(packageLock.packages?.[""]?.version === packageJson.version, "package-lock.json package entry version must match package.json.");
check(tauriConfig.version === packageJson.version, "src-tauri/tauri.conf.json version must match package.json.");
check(cargoVersion === packageJson.version, "src-tauri/Cargo.toml package version must match package.json.");
check(cargoLockVersion === packageJson.version, "src-tauri/Cargo.lock package version must match package.json.");

check(typeof csp === "string" && csp.length > 0, "Production Tauri CSP must be enabled.");
check(!/\bunsafe-inline\b/.test(csp ?? ""), "Production Tauri CSP must not allow unsafe-inline.");
check(csp?.includes("object-src 'none'"), "Production Tauri CSP must block object sources.");
check(csp?.includes("base-uri 'none'"), "Production Tauri CSP must block base URI injection.");
check(csp?.includes("frame-ancestors 'none'"), "Production Tauri CSP must block embedding.");
check(csp?.includes("form-action 'none'"), "Production Tauri CSP must block form submissions.");
check(typeof devCsp === "string" && devCsp.includes("ws://127.0.0.1:1420"), "Dev CSP must allow Vite HMR on 127.0.0.1:1420.");
check(security.dangerousDisableAssetCspModification === false, "Tauri asset CSP modification must remain enabled.");
check(Array.isArray(capabilities) && capabilities.includes("default"), "Tauri capability files must be selected explicitly.");

check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(indexHtml), "index.html must not contain inline script tags.");
check(!/<style[\s>]/i.test(indexHtml), "index.html must not contain inline style tags.");

for (const entry of ["musicbee-library.tsv", "AlbumCovers/", "CSV/", "CSV_SINGLES/", "*.sqlite3", "*.sqlite3-*"]) {
  check(gitignore.includes(entry), `.gitignore must keep ${entry} ignored.`);
}

if (failures.length > 0) {
  console.error("Release/security checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Release/security checks passed.");
