export const meta = {
id: "site.kuaizhui",
name: "快追影视",
version: "1.0.0",
protocol: 1,
description: "快追影视（www.kuaizhui.tv）内容源插件。",
author: "you",
homepage: "https://www.kuaizhui.tv/",
updateUrl: "https://www.kuaizhui.tv/plugin/site.kuaizhui.js",
linkDomains: ["www.kuaizhui.tv", "kuaizhui.tv"],
defaultHeaders: {
Referer: "https://www.kuaizhui.tv/",
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
},
timeouts: { read: 20, playback: 30 },
settings: [
{
key: "apiBase",
type: "text",
label: "接口地址",
default: "https://cvo.kuaicloud.one",
description: "一般无需修改；站点更换 API 域名时在此调整。",
},
],
};
const AES_KEY = "kWJ2D5aDlneVeRcr";
const PAGE_SIZE = 36;
const GROUP_PREVIEW = 12;
const TYPE_MAP = {
1: "movie", 2: "series", 3: "variety", 4: "anime",
37: "short", 93: "other", 107: "anime", 1001: "other",
1002: "other", 1003: "other", 1005: "movie",
};
export default function (hg) {
const apiBase = String(hg.settings.get("apiBase") || "https://cvo.kuaicloud.one")
.replace(/\/+$/, "");
const AES_KEY_BYTES = hg.codec.utf8Encode(AES_KEY);
function encryptRequest(obj) {
const plain = hg.codec.utf8Encode(JSON.stringify(obj));
const encrypted = hg.crypto.aesEncrypt({ mode: "ecb", key: AES_KEY_BYTES, padding: "pkcs7" }, plain);
return hg.codec.hexEncode(encrypted).toUpperCase();
}
function decryptResponse(raw) {
if (typeof raw !== "string") return raw;
const text = raw.trim();
if (!text) return null;
if (!/^[0-9a-fA-F]+$/.test(text) || text.length % 2 !== 0) {
try { return JSON.parse(text); }
catch { throw new hg.PluginError("UPSTREAM_CHANGED", "响应格式无法识别"); }
}
try {
const bytes = hg.codec.hexDecode(text);
const plain = hg.crypto.aesDecrypt({ mode: "ecb", key: AES_KEY_BYTES, padding: "pkcs7" }, bytes);
return JSON.parse(hg.codec.utf8Decode(plain));
} catch (error) {
if (error instanceof hg.PluginError && error.code === "UPSTREAM_CHANGED") throw error;
throw new hg.PluginError("UPSTREAM_CHANGED", "响应解密失败");
}
}
async function api(path, data, ctx) {
const res = await hg.http.fetch({
url: apiBase + path,
method: "POST",
headers: {
"Content-Type": "application/json",
KV: "1",
V: "1.0.0",
...(hg.settings.get("sessionId") ? { S: String(hg.settings.get("sessionId")) } : {}),
},
body: encryptRequest(data || {}),
responseType: "text",
timeoutMs: 15000,
signal: ctx?.signal,
});
if (res.status === 401 || res.status === 403) {
throw new hg.PluginError("AUTH_REQUIRED", "请先登录快追账号");
}
if (res.status === 429) {
throw new hg.PluginError("RATE_LIMITED", "请求过于频繁", { retryAfterSec: 30 });
}
if (!res.ok) throw new hg.PluginError("UPSTREAM_ERROR", `来源返回 ${res.status}`);
const data2 = decryptResponse(res.data);
if (data2 && !Array.isArray(data2) && typeof data2 === "object" &&
typeof data2.Code === "string" && data2.Code !== "S00000") {
if (data2.Code === "S00014") throw new hg.PluginError("INVALID_ARGUMENT", data2.Msg || "请求参数无效");
throw new hg.PluginError("UPSTREAM_ERROR", data2.Msg || data2.Code);
}
return data2;
}
function toItem(row) {
if (!row || typeof row !== "object" || !Number.isFinite(row.VodID)) return null;
const typeId = Number(row.ParentTypeID || row.TypeID);
return {
id: String(row.VodID),
title: String(row.VodName || ""),
type: TYPE_MAP[typeId] || "other",
cover: row.VodPicThumb || row.VodPicBanner || undefined,
backdrop: row.VodPicBanner || undefined,
year: /^\d{4}$/.test(String(row.VodYear || "")) ? Number(row.VodYear) : undefined,
score: Number(row.VodDoubanScore) > 0 ? Number(row.VodDoubanScore) : undefined,
description: row.VodActor ? `主演：${row.VodActor}` : undefined,
badge: typeof row.VodRemarks === "string" && row.VodRemarks.length <= 8
? row.VodRemarks.replace(/^更新至/, "").slice(0, 8) : undefined,
entryEpisodeId: undefined,
};
}
function detailFields(vodTypes) {
const out = { category: "", totalEpisodes: undefined };
for (const item of Array.isArray(vodTypes) ? vodTypes : []) {
if (item?.Type === "category") out.category = String(item.Content || "");
if (item?.Type === "total_episodes") {
const n = Number(item.Content);
if (Number.isFinite(n)) out.totalEpisodes = n;
}
}
return out;
}
function mediaTypeFromCategory(text) {
const s = String(text || "");
if (s.includes("电影")) return "movie";
if (s.includes("剧集") || s.includes("电视剧")) return "series";
if (s.includes("动漫")) return "anime";
if (s.includes("综艺")) return "variety";
if (s.includes("短剧")) return "short";
return "other";
}
return {
home: {
async getSections(params, ctx) {
const categories = await api("/u/main/category", {}, ctx);
if (!Array.isArray(categories) || !categories.length) {
throw new hg.PluginError("UPSTREAM_CHANGED", "分类列表为空");
}
const sections = [];
for (const cat of categories.slice(0, 3)) {
const typeId = Number(cat.TypeID);
if (!Number.isFinite(typeId)) continue;
try {
const detail = await api("/u/category/detail", { TypeID: typeId }, ctx);
const banners = Array.isArray(detail?.BannerItems) ? detail.BannerItems : [];
if (banners.length) {
sections.push({
id: `banner-${typeId}`,
title: cat.DisplayName || cat.TypeName,
layout: "banner",
imageAspect: "landscape",
items: banners.map((row) => ({
id: String(row.VodID),
title: String(row.VodName || ""),
backdrop: row.BannerUrlOrigin || row.BannerUrl || row.VodPicBanner || undefined,
cover: row.VodPicThumb || undefined,
})).filter((x) => x.id && x.title),
});
}
} catch (error) {
hg.log.warn("首页轮播获取失败", { typeId, code: error?.code });
}
}
sections.push({
id: "categories",
title: "分类导航",
layout: "grid",
items: categories.map((cat) => ({
id: `cat:${cat.TypeID}`,
title: String(cat.DisplayName || cat.TypeName || ""),
cover: cat.IconUrl || undefined,
})).filter((x) => x.id && x.title),
});
return { items: sections, next: null };
},
},
catalog: {
async getCategories(params, ctx) {
const rows = await api("/u/main/category", {}, ctx);
if (!Array.isArray(rows)) throw new hg.PluginError("UPSTREAM_CHANGED", "分类结构已变化");
return rows.map((row) => ({
id: String(row.TypeID),
label: String(row.DisplayName || row.TypeName || ""),
})).filter((x) => x.id && x.label);
},
async getFilters({ categoryId }, ctx) {
const typeId = Number(categoryId);
if (!Number.isFinite(typeId)) return {};
const detail = await api("/u/category/detail", { TypeID: typeId }, ctx);
const filters = [];
const sorts = [];
for (const group of Array.isArray(detail?.Filters) ? detail.Filters : []) {
const code = String(group.FilterCode || "");
const options = (Array.isArray(group.FilterItems) ? group.FilterItems : [])
.map((item) => ({ id: String(item.ItemValue ?? ""), label: String(item.ItemName || "") }))
.filter((x) => x.label);
if (code === "Sort") {
sorts.push(...options);
continue;
}
if (["MainCategory", "SubCategory", "Area", "Year"].includes(code)) {
filters.push({ id: code, label: String(group.FilterTitle || code), options, multiple: false });
}
}
return { filters, sorts };
},
async list({ categoryId, filters, sort, cursor }, ctx) {
const typeId = Number(categoryId);
if (!Number.isFinite(typeId)) return { items: [], next: null };
const pageIndex = Number(cursor || 0);
const sortValue = String(sort || "vod_year");
const cond = {
ParentTypeID: typeId,
Sort: sortValue,
Area: String(filters?.Area?.[0] || ""),
SubCategory: String(filters?.SubCategory?.[0] || ""),
Year: String(filters?.Year?.[0] || ""),
Paging: { PageIndex: pageIndex, PageSize: PAGE_SIZE },
};
void filters?.MainCategory?.[0];
const result = await api("/u/category/vod/list/more", { Cond: cond }, ctx);
const rows = Array.isArray(result?.Result) ? result.Result
: Array.isArray(result) ? result : [];
if (!rows.length && result?.Code) {
throw new hg.PluginError("UPSTREAM_CHANGED", result.Msg || "列表查询失败");
}
const items = rows.map(toItem).filter(Boolean);
const paging = result?.Paging;
const hasMore = paging && Number.isFinite(paging.AllCount)
? (pageIndex + 1) * PAGE_SIZE < Number(paging.AllCount)
: items.length >= PAGE_SIZE;
return { items, next: hasMore ? String(pageIndex + 1) : null, total: paging?.AllCount };
},
},
search: {
async search({ query }, ctx) {
const q = String(query || "").trim();
if (!q) return { items: [], next: null };
const rows = await api("/u/vod/search", { VodName: q }, ctx);
if (!Array.isArray(rows)) throw new hg.PluginError("UPSTREAM_CHANGED", "搜索结果结构已变化");
return { items: rows.map(toItem).filter(Boolean), next: null };
},
async trending(params, ctx) {
const rows = await api("/u/vod/search/hotword", {}, ctx);
return Array.isArray(rows) ? rows.map(String) : [];
},
},
media: {
async getDetail({ id }, ctx) {
const vodId = Number(id);
if (!Number.isFinite(vodId)) throw new hg.PluginError("INVALID_ARGUMENT", "无效的条目 ID");
const detail = await api("/u/vod/detail", { VodID: vodId, SuggestCount: 8 }, ctx);
if (!detail || typeof detail !== "object") throw new hg.PluginError("NOT_FOUND", "内容不存在");
const metaFields = detailFields(detail.VodTypes);
const playlists = [];
for (const player of Array.isArray(detail.Players) ? detail.Players : []) {
const contents = Array.isArray(player?.Contents) ? player.Contents : [];
const episodes = [];
for (let i = 0; i < contents.length; i++) {
const ep = contents[i];
if (!ep || typeof ep.Url !== "string" || !ep.Url) continue;
episodes.push({
id: `${player.PlayerCode || "main"}|${i + 1}`,
index: i + 1,
label: String(ep.EpisodeTitle || `第${i + 1}集`),
});
}
if (episodes.length) {
playlists.push({
id: String(player.PlayerCode || "main"),
label: String(player.PlayerName || "默认线路"),
kind: playlists.length === 0 ? "main" : "other",
episodes,
next: null,
});
}
}
if (!playlists.length) throw new hg.PluginError("CONTENT_LOCKED", "该内容暂无可播放分集");
const related = Array.isArray(detail.SuggestVods)
? detail.SuggestVods.map(toItem).filter(Boolean) : [];
return {
id: String(vodId),
title: String(detail.Title || ""),
type: mediaTypeFromCategory(metaFields.category),
cover: detail.PosterUrl || undefined,
description: String(detail.Summary || ""),
year: metaFields.category ? undefined : undefined,
episodeCount: metaFields.totalEpisodes ?? playlists[0].episodes.length,
totalEpisodes: metaFields.totalEpisodes,
score: undefined,
playlists,
related,
};
},
async resolvePlayback({ mediaId, episodeId, playlistId, serverId, reason }, ctx) {
const vodId = Number(mediaId);
if (!Number.isFinite(vodId)) throw new hg.PluginError("INVALID_ARGUMENT", "无效的条目 ID");
const detail = await api("/u/vod/detail", { VodID: vodId, SuggestCount: 0 }, ctx);
const players = Array.isArray(detail?.Players) ? detail.Players : [];
if (!players.length) throw new hg.PluginError("CONTENT_LOCKED", "该内容当前不可播放");
let player = null;
let epIndex = 1;
if (typeof episodeId === "string" && episodeId.includes("|")) {
const [code, idx] = episodeId.split("|");
player = players.find((p) => String(p.PlayerCode) === code) || null;
epIndex = Number(idx) || 1;
}
if (!player) {
player = players.find((p) => String(p.PlayerCode) === String(serverId || playlistId)) || players[0];
}
const ep = player.Contents?.[epIndex - 1];
if (!ep || typeof ep.Url !== "string" || !ep.Url) {
throw new hg.PluginError("NOT_FOUND", "分集不存在");
}
let streamUrl = ep.Url;
if (ep.NeedParse || player.NeedParse) {
const parsed = await api("/u/vod/parse/url", {
Url: ep.Url,
PlayerCode: String(player.PlayerCode || ""),
}, ctx);
streamUrl = typeof parsed?.Url === "string" ? parsed.Url : "";
if (!streamUrl) throw new hg.PluginError("CONTENT_LOCKED", "播放地址解析失败");
}
if (reason === "refresh") hg.log.info("刷新播放地址", { mediaId, episodeId });
const isHls = /\.m3u8(?:\?|$)/i.test(streamUrl);
return {
streams: [{
url: streamUrl,
kind: "media",
format: isHls ? "hls" : "progressive",
label: String(player.PlayerName || "默认线路"),
serverId: String(player.PlayerCode || "main"),
}],
servers: players.map((p) => ({
id: String(p.PlayerCode || "main"),
label: String(p.PlayerName || "线路"),
})),
};
},
},
comments: {
async list({ target, cursor }, ctx) {
if (target?.kind !== "media") return { items: [], next: null };
const pageIndex = Number(cursor || 0);
let payload;
try {
payload = await api("/u/vod/comment/list", {
VodID: Number(target.mediaId),
Paging: { PageIndex: pageIndex, PageSize: 20 },
}, ctx);
} catch (error) {
hg.log.warn("评论获取失败", { code: error?.code });
return { items: [], next: null };
}
const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.Result) ? payload.Result : []);
return {
items: rows.map((row) => ({
id: String(row.CommentID ?? row.ID ?? ""),
author: { id: row.UserID ? String(row.UserID) : undefined, name: String(row.UserName || "用户") },
text: String(row.Content || row.Text || ""),
createdAt: Number(row.CreatedAt || 0) || undefined,
likes: Number(row.Likes || 0) || undefined,
})).filter((x) => x.id && x.text),
next: null,
};
},
},
};
}