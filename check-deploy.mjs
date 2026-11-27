/**
 * 上传前检查：确保插件可在 GitHub 正常工作
 *
 * 部署到 GitHub 前，本脚本检查：
 *   1. meta 必填字段合规（id / name / version / protocol）
 *   2. 工厂能构造、能力方法齐全
 *   3. 无 import 语句（HPP 要求自包含）
 *   4. 文件体积 < 2 MiB
 *   5. manifest.json 与插件 meta 的 id/version 一致
 *   6. AES 加密链路可用（key 为 Uint8Array）
 *
 *    node check-deploy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createMockHost } from "../hghub-plugin-lab/harness/mock-hg.mjs";

const DIR = path.join(import.meta.dirname, "plugins");
const load = (file) => import(pathToFileURL(path.join(DIR, file)).href + `?t=${Date.now()}`);

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`  OK  ${n}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? " - " + d : ""}`); }
};

function checkFile(file) {
  console.log(`\n[${file}]`);
  const full = path.join(DIR, file);
  const src = fs.readFileSync(full, "utf8");
  const bytes = Buffer.byteLength(src, "utf8");
  ok("体积 < 2 MiB", bytes < 2 * 1024 * 1024, `${bytes} bytes`);
  ok("无 import 语句", !/^\s*import\s/m.test(src), "HPP 禁止静态导入");
  ok("UTF-8 无 BOM", !src.startsWith("\uFEFF"));
  return src;
}

// ---------- kuaizhui.js ----------
checkFile("kuaizhui.js");
const mod = await load("kuaizhui.js");
ok("meta.id 合法", /^[a-z0-9][a-z0-9._-]{0,63}$/.test(mod.meta.id), mod.meta.id);
ok("meta.name", typeof mod.meta.name === "string" && mod.meta.name.length <= 60);
ok("meta.version 三段", /^\d+\.\d+\.\d+$/.test(mod.meta.version), mod.meta.version);
ok("meta.protocol=1", mod.meta.protocol === 1);
ok("updateUrl 已配置", typeof mod.meta.updateUrl === "string" && mod.meta.updateUrl.startsWith("https://"));

const { hg } = createMockHost({ plugin: { id: mod.meta.id, version: mod.meta.version }, settings: {} });
const p = await mod.default(hg);
ok("工厂可构造", !!p);
ok("media.getDetail/resolvePlayback",
  typeof p.media?.getDetail === "function" && typeof p.media?.resolvePlayback === "function");
ok("search.search", typeof p.search?.search === "function");
ok("catalog 三方法",
  ["getCategories", "getFilters", "list"].every((m) => typeof p.catalog?.[m] === "function"));

const key = hg.codec.utf8Encode("kWJ2D5aDlneVeRcr");
const enc = hg.crypto.aesEncrypt({ mode: "ecb", key, padding: "pkcs7" }, hg.codec.utf8Encode("{}"));
ok("AES 加密正常", enc instanceof Uint8Array);

// ---------- manifest.json ----------
console.log("\n[manifest.json]");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
ok("有 plugins 数组", Array.isArray(manifest.plugins));
for (const item of manifest.plugins) {
  ok(`条目 ${item.id} 文件存在`, fs.existsSync(path.join(DIR, item.url)), item.url);
  const targetMod = await load(item.url);
  ok(`条目 ${item.id} id 一致`, targetMod.meta.id === item.id,
    `manifest=${item.id} file=${targetMod.meta.id}`);
  ok(`条目 ${item.id} version 一致`, targetMod.meta.version === item.version,
    `manifest=${item.version} file=${targetMod.meta.version}`);
  ok(`条目 ${item.id} name 一致`, targetMod.meta.name === item.name);
}

// ---------- kuaizhui-lite.js ----------
console.log("\n[kuaizhui-lite.js]");
const liteMod = await load("kuaizhui-lite.js");
ok("lite meta.id 一致", liteMod.meta.id === mod.meta.id);
ok("lite 与完整版同版本", liteMod.meta.version === mod.meta.version);
ok("lite 无注释块", !/\/\*/.test(fs.readFileSync(path.join(DIR, "kuaizhui-lite.js"), "utf8")));

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log("有检查项未通过，先修复再推送。"); process.exitCode = 1; }
else console.log("全部通过，可以推到 GitHub。");
