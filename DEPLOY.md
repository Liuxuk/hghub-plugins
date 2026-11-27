# 部署到 GitHub 完整指南

本目录（`hghub-plugin-deploy`）已是可直接推送的仓库结构，`node check-deploy.mjs` 21 项检查全部通过。

```
hghub-plugin-deploy/
├── README.md              # 仓库首页说明（已含 Liuxuk 占位符）
├── .gitignore
├── check-deploy.mjs       # 上传前自检脚本
└── plugins/
    ├── kuaizhui.js        # 完整版
    ├── kuaizhui-lite.js   # 精简版（手机粘贴用）
    └── manifest.json      # 插件列表
```

---

## 一、选哪种托管方式

| 方式 | URL 形式 | 优点 | 限制 |
| --- | --- | --- | --- |
| **Raw（推荐）** | `https://raw.githubusercontent.com/用户/仓库/main/plugins/kuaizhui.js` | 配置最简单，无需开 Pages，立即生效 | 国内访问 Raw 可能被墙，需要代理 |
| **GitHub Pages** | `https://用户.github.io/仓库/plugins/kuaizhui.js` | 走 CDN，国内相对更容易访问；可自定义域名 | 需在仓库设置里开启 Pages |
| **jsDelivr CDN** | `https://cdn.jsdelivr.net/gh/用户/仓库@main/plugins/kuaizhui.js` | 国内速度最好，自动缓存 | 第三方服务，首次推送后可能有延迟 |

> **建议**：既然你已经确认这个站需要 VPN，那用 Raw 就行。但如果想让别人也能用，**强烈建议用 jsDelivr**——它在国内通常直连可用，能绕过 Raw 被墙的问题。

三种 URL 可以同时可用，`updateUrl` 填哪个都行。

---

## 二、创建仓库并推送

### 1. 在 GitHub 上建仓库

浏览器打开 https://github.com/new

- **Repository name**：如 `hghub-plugins`（随意）
- **Visibility**：选 **Public**（私有仓库的 Raw 地址需要鉴权，HGhub 拿不到）
- **不要**勾选 "Add a README file"（本地已有）

创建后记下仓库地址，形如：
```
https://github.com/Liuxuk/hghub-plugins.git
```

### 2. 本地初始化并推送

在本目录执行（把 `Liuxuk` / `hghub-plugins` 换成你的）：

```powershell
cd "C:\Users\Admin\Desktop\DSH文档\hghub-plugin-deploy"

git init
git branch -M main

# 首次使用需配置身份（只需一次）
git config user.name "你的名字"
git config user.email "你的邮箱@example.com"

git add .
git commit -m "feat: 快追影视 HGhub 插件 v1.0.0"
git remote add origin https://github.com/Liuxuk/hghub-plugins.git
git push -u origin main
```

推送时会要求登录。GitHub 已不支持密码，用 **Personal Access Token** 当密码：

1. 打开 https://github.com/settings/tokens
2. Generate new token (classic) → 勾选 `repo` → 生成
3. 复制 token，推送时用户名填 GitHub 用户名，密码粘贴 token

---

## 三、改掉占位地址

推送前必须把两处 `Liuxuk/hghub-plugins` 改成你的真实路径：

### 1. `plugins/kuaizhui.js` 里的 `updateUrl`

```js
updateUrl: "https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/kuaizhui.js",
```

改成，例如：
```js
updateUrl: "https://raw.githubusercontent.com/zhangsan/hghub-plugins/main/plugins/kuaizhui.js",
```

或 jsDelivr 版：
```js
updateUrl: "https://cdn.jsdelivr.net/gh/zhangsan/hghub-plugins@main/plugins/kuaizhui.js",
```

### 2. `README.md` 里的导入地址

把文中三处 `Liuxuk/hghub-plugins` 换成真实路径。

改完重跑自检：
```powershell
node check-deploy.mjs
```

---

## 四、（可选）开启 GitHub Pages

如果想要 `https://用户.github.io/仓库/` 形式的地址：

1. 仓库 → **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 `/ (root)`
4. 点 **Save**，等 1–2 分钟
5. 访问 `https://Liuxuk.github.io/hghub-plugins/plugins/manifest.json` 验证

> Pages 默认会跑 Jekyll，下划线开头的文件会被忽略。本仓库没有这类文件，无需加 `.nojekyll`。但**如果以后加了** `_` 开头的文件，记得在根目录放一个空的 `.nojekyll`。

---

## 五、验证部署成功

推送后逐个验证（把地址换成你的）：

```powershell
# 1. Raw 单文件能取到
curl.exe -I https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/kuaizhui.js

# 2. 列表能取到且是合法 JSON
curl.exe https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/manifest.json

# 3. 文件内容开头正确
curl.exe https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/kuaizhui.js | Select-Object -First 3
```

预期：
- 第 1 条返回 `HTTP/1.1 200 OK`；
- 第 2 条是完整 JSON，`id` / `version` 与插件文件内一致；
- 第 3 条能看到 `export const meta = {`。

**注意 GitHub Raw 的缓存**：更新文件后 Raw 地址可能有几分钟缓存（`Cache-Control: max-age=300`）。HGhub 检查更新拿不到新版本时，等 5 分钟或换 jsDelivr 地址（加 `?t=时间戳` 也能绕过，但 `updateUrl` 不建议带参数）。

---

## 六、在 HGhub 里导入

### 订阅整个列表（推荐）

HGhub → 插件中心 →「导入与订阅」→ 地址栏填：

```
https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/manifest.json
```

点「读取列表或插件」→ 勾选条目 →「导入所选插件」→ 成功后点「保存订阅」。

以后你在仓库里新增插件或升版本，HGhub 里点「刷新订阅」就能看到。

### 只导入单个插件

地址栏填 `.../plugins/kuaizhui.js`，其余相同。

### 手机端注意

手机导入时如果 Raw 被墙：
- 改用 jsDelivr 地址（国内通常直连可用）：
  `https://cdn.jsdelivr.net/gh/Liuxuk/hghub-plugins@main/plugins/manifest.json`
- 或按 `kuaizhui-lite.js` 粘贴导入；
- 插件跑起来后仍需要代理才能访问 `cvo.kuaicloud.one`（见 `06-network-proxy-guide.md`）。

**关键区别**：导入插件时下载的是 **GitHub 的 JS 文件**，需要能访问 GitHub；插件运行后请求的是**快追的 API**，需要能访问 `cvo.kuaicloud.one`。这是两件不同的事，两个都得通。

---

## 七、后续更新插件

1. 改 `plugins/kuaizhui.js`，把 `meta.version` 提高：`1.0.0` → `1.0.1`
2. **同步改** `plugins/manifest.json` 里对应条目的 `version`——不一致会导致该条导入失败（HPP 硬性要求）
3. 如果改了代码，重新生成精简版（或手动同步）
4. 跑 `node check-deploy.mjs` 确认一致
5. 提交推送：
   ```powershell
   git add .
   git commit -m "chore: bump kuaizhui to 1.0.1"
   git push
   ```
6. HGhub 里「检查插件更新」→ 安装

> 版本号必须三段纯数字（`1.0.1`），不能写 `1.0.1-beta`。比较按数字段逐段，`1.10.0` > `1.9.0`。

---

## 八、常见问题

| 问题 | 原因与处理 |
| --- | --- |
| 推送报 `Authentication failed` | 不能用账号密码，改用 Personal Access Token |
| 推送报 `remote origin already exists` | `git remote remove origin` 后重新 add |
| Raw 地址返回 404 | 检查分支名是不是 `main`（老仓库可能是 `master`）、路径大小写、文件是否真的推上去了 |
| HGhub 导入报「列表与文件不一致」 | `manifest.json` 的 id/version/name 必须与插件 `meta` 完全一致 |
| HGhub 导入报「不是合法 JSON/JS」 | 可能把 GitHub 的 HTML 页面地址当 Raw 地址填了；Raw 地址应含 `raw.githubusercontent.com` |
| 检查更新一直「已是最新」 | Raw 有 5 分钟缓存；或 `updateUrl` 还留着 `Liuxuk` 占位符；或版本号没提高 |
| 私有仓库能否用 | 不能，HGhub 下载时没有你的 GitHub 凭据 |

---

## 九、安全与合规提醒

- **仓库要 Public**，所以插件代码（含站点 API 地址和 AES key）是公开的。这是 HPP 插件的常态——key 本来就打包在站点前端 bundle 里。
- 插件里**不要**放你自己的账号 Cookie、token 或个人 API key。
- 本仓库只存插件代码，不托管任何视频内容。内容由第三方站点提供。
- HGhub 项目本身是 PolyForm Noncommercial 许可，**禁止商业用途**（含广告、付费、卡密、VIP）；你的插件仓库也建议遵守同样的非商业立场。
