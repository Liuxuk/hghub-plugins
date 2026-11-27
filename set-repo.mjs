/**
 * 一键替换占位符：把 YOUR_NAME / YOUR_REPO 换成你的 GitHub 用户名和仓库名。
 *
 *   node set-repo.mjs <用户名> <仓库名>
 *
 * 例：
 *   node set-repo.mjs zhangsan hghub-plugins
 *
 * 会改动：plugins/kuaizhui.js 的 updateUrl、README.md、DEPLOY.md。
 * 只替换文件正文，不动 .git 目录。
 */
import fs from "node:fs";
import path from "node:path";

const [user, repo] = process.argv.slice(2);
if (!user || !repo) {
  console.error("用法: node set-repo.mjs <GitHub用户名> <仓库名>");
  console.error("例如: node set-repo.mjs zhangsan hghub-plugins");
  process.exit(1);
}
// GitHub 用户名：字母数字与连字符；仓库名：字母数字 . _ -
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(user)) {
  console.error(`用户名不合法：${user}（字母/数字/连字符，不能以连字符开头或结尾）`);
  process.exit(1);
}
if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
  console.error(`仓库名不合法：${repo}（字母/数字/点/下划线/连字符）`);
  process.exit(1);
}

const ROOT = import.meta.dirname;
const targets = [
  "plugins/kuaizhui.js",
  "README.md",
  "DEPLOY.md",
];

let total = 0;
for (const rel of targets) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.log(`跳过（不存在）: ${rel}`); continue; }
  const before = fs.readFileSync(full, "utf8");
  // YOUR_NAME/YOUR_REPO 优先整体替换，再处理单独出现的 YOUR_NAME
  let after = before
    .replaceAll("YOUR_NAME/YOUR_REPO", `${user}/${repo}`)
    .replaceAll("YOUR_NAME", user)
    .replaceAll("YOUR_REPO", repo);
  const count = (before.match(/YOUR_NAME|YOUR_REPO/g) || []).length;
  if (after !== before) {
    fs.writeFileSync(full, after, "utf8");
    console.log(`已更新 ${rel}（替换 ${count} 处）`);
    total += count;
  } else {
    console.log(`无占位符 ${rel}`);
  }
}

console.log(`\n共替换 ${total} 处。`);
console.log("\n现在可访问的地址：");
console.log(`  Raw      https://raw.githubusercontent.com/${user}/${repo}/main/plugins/manifest.json`);
console.log(`  Pages    https://${user.toLowerCase()}.github.io/${repo}/plugins/manifest.json`);
console.log(`  jsDelivr https://cdn.jsdelivr.net/gh/${user}/${repo}@main/plugins/manifest.json`);
console.log("\n接着运行自检：node check-deploy.mjs");
