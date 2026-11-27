# 我的 HGhub 插件集

HGhub（[Minireel/HGhub](https://github.com/Minireel/HGhub)）插件仓库。

## 插件列表

| 插件 | ID | 说明 |
| --- | --- | --- |
| 快追影视 | `site.kuaizhui` | 快追影视站点内容源 |

## 导入方式

### 方式一：订阅列表（推荐）

在 HGhub → 插件中心 →「导入与订阅」→「从网址导入插件或订阅列表」，填入：

```
https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/manifest.json
```

导入后可保存为订阅，以后一键刷新。

### 方式二：直接导入单个插件

```
https://raw.githubusercontent.com/Liuxuk/hghub-plugins/main/plugins/kuaizhui.js
```

### 方式三：粘贴代码

复制 `plugins/kuaizhui-lite.js` 的全文，在「粘贴代码导入」里粘贴。

## 网络要求

插件请求走 HGhub 自己的网络层，浏览器 VPN 不生效。若搜索为空或报 `NETWORK`，请在 HGhub →「设置 → 网络 → 代理访问」配置代理，测试地址填 `https://cvo.kuaicloud.one`。

## 目录结构

```
plugins/
├── kuaizhui.js       # 完整版（带注释）
├── kuaizhui-lite.js  # 精简版（13KB 无注释，手机粘贴用）
└── manifest.json     # 插件列表
```

## 更新插件

1. 修改 `plugins/kuaizhui.js`，把 `meta.version` 提高（如 `1.0.0` → `1.0.1`）。
2. 同步更新 `plugins/manifest.json` 里的 `version`（必须与文件内一致，否则该条导入失败）。
3. 提交并推送。
4. HGhub 里「检查插件更新」→ 安装更新。

> 版本号必须三段数字，按数字段逐段比较，`1.10.0` 高于 `1.9.0`。

## 说明

本仓库只存放插件代码，不托管任何内容。插件访问的内容由第三方站点提供，与本仓库无关。
