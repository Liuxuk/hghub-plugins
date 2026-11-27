/**
 * 快追影视（www.kuaizhui.tv）HPP 1.0 插件
 *
 * 逆向自站点前端 bundle（assets/index-BQjsWytz.js）：
 *   - API:  https://cvo.kuaicloud.one
 *   - 请求/响应：AES-128-ECB / PKCS7，密钥 kWJ2D5aDlneVeRcr，十六进制大写
 *   - 请求头：KV:1、V:1.0.0（无登录时 S 头省略）
 *
 * 实现的接口：
 *   /u/main/category           分类导航
 *   /u/category/detail         轮播图 + 筛选器
 *   /u/category/vod/list       分类列表（首屏，按 Vods 分组）
 *   /u/category/vod/list/more  分类列表（翻页，按 Result 数组）
 *   /u/vod/search              搜索
 *   /u/vod/search/hotword      热搜词
 *   /u/vod/detail              详情 + 分集 + 多线路
 *   /u/vod/parse/url           需要解析的播放地址
 *   /u/vod/comment/list        评论（上游当前返回 System Failure，保留容错）
 *
 * 注意：本文件只做协议适配，不托管、不分发任何内容。
 */

export const meta = {
  id: "site.kuaizhui",
  name: "快追影视",
  version: "1.0.0",
  protocol: 1,
  description: "快追影视（www.kuaizhui.tv）内容源插件。",
  author: "you",
  homepage: "https://www.kuaizhui.tv/",
  // 部署后改成你的真实地址，例如：
  // https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPO/main/plugins/kuaizhui.js
  // 或 GitHub Pages: https://YOUR_NAME.github.io/YOUR_REPO/plugins/kuaizhui.js
  updateUrl: "https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPO/main/plugins/kuaizhui.js",
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
// 首屏 list 接口按分组返回（每组 36 条），协议单页上限 100，每组只取前若干条
const GROUP_PREVIEW = 12;

// 分类 ID → 媒体类型（用于换源与聚合匹配）
const TYPE_MAP = {
  1: "movie", 2: "series", 3: "variety", 4: "anime",
  37: "short", 93: "other", 107: "anime", 1001: "other",
  1002: "other", 1003: "other", 1005: "movie",
};

export default function (hg) {
  const apiBase = String(hg.settings.get("apiBase") || "https://cvo.kuaicloud.one")
    .replace(/\/+$/, "");

  // 宿主原生 AES 要求 key/data 都是 Uint8Array（native.rs: bytes("key")?）
  const AES_KEY_BYTES = hg.codec.utf8Encode(AES_KEY);

  /** AES-128-ECB 加密 JSON 请求体 → 大写 hex（原生实现，不占用 JS 运行时做重计算） */
  function encryptRequest(obj) {
    const plain = hg.codec.utf8Encode(JSON.stringify(obj));
    const encrypted = hg.crypto.aesEncrypt({ mode: "ecb", key: AES_KEY_BYTES, padding: "pkcs7" }, plain);
    return hg.codec.hexEncode(encrypted).toUpperCase();
  }

  /** 解密响应 hex → JSON；站点有的接口直接回 JSON，做兼容 */
  function decryptResponse(raw) {
    if (typeof raw !== "string") return raw;
    const text = raw.trim();
    if (!text) return null;
    // 非 hex 内容（例如直接返回 JSON 字符串）原样解析
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

  /** 统一 POST：加密请求头 + 解密响应 + 业务错误码映射 */
  async function api(path, data, ctx) {
    const res = await hg.http.fetch({
      url: apiBase + path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        KV: "1",
        V: "1.0.0",
        // S 头为登录会话 ID，未登录不发送
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
    // 业务错误：{ Code: "S00000", Msg: "System Failure" } 等
    if (data2 && !Array.isArray(data2) && typeof data2 === "object" &&
        typeof data2.Code === "string" && data2.Code !== "S00000") {
      if (data2.Code === "S00014") throw new hg.PluginError("INVALID_ARGUMENT", data2.Msg || "请求参数无效");
      throw new hg.PluginError("UPSTREAM_ERROR", data2.Msg || data2.Code);
    }
    return data2;
  }

  // ───────────────────── 数据映射 ─────────────────────

  /** 搜索/列表条目 → MediaItem */
  function toItem(row) {
    if (!row || typeof row !== "object" || !Number.isFinite(row.VodID)) return null;
    const typeId = Number(row.ParentTypeID || row.TypeID);
    return {
      id: String(row.VodID),                       // 稳定的真实 VodID
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

  /** 详情字段：VodTypes 里的 total_episodes / category 等 */
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

  /** URL 编码（上游地址含中文路径，组件间原样透传即可） */
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
    // ───────────────────── 首页 ─────────────────────
    home: {
      async getSections(params, ctx) {
        const categories = await api("/u/main/category", {}, ctx);
        if (!Array.isArray(categories) || !categories.length) {
          throw new hg.PluginError("UPSTREAM_CHANGED", "分类列表为空");
        }
        const sections = [];

        // 首页的分类详情里带轮播图，取前两个分类做 banner / row
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
            // 单个分区失败不影响整页
            hg.log.warn("首页轮播获取失败", { typeId, code: error?.code });
          }
        }

        // 分类导航作为一个 list 分区，方便用户从这里进入分类页
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

    // ───────────────────── 分类 ─────────────────────
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
        // 上游要求排序字段非空，否则 list/more 返回 464「查询参数错误」
        const sortValue = String(sort || "vod_year");

        const cond = {
          ParentTypeID: typeId,
          Sort: sortValue,
          Area: String(filters?.Area?.[0] || ""),
          SubCategory: String(filters?.SubCategory?.[0] || ""),
          Year: String(filters?.Year?.[0] || ""),
          Paging: { PageIndex: pageIndex, PageSize: PAGE_SIZE },
        };
        // 保留 mainCategory 供筛选器使用（上游 list/more 不接受该字段，故不放入 cond）
        void filters?.MainCategory?.[0];

        // 统一走 list/more：它按 PageIndex 返回稳定的 36 条分页，不会与首屏分组内容重复。
        // list 接口返回的分组内容（每组 36 条 × 10 组）已由 home 的 banner 分区覆盖。
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

    // ───────────────────── 搜索 ─────────────────────
    search: {
      async search({ query }, ctx) {
        const q = String(query || "").trim();
        if (!q) return { items: [], next: null };
        const rows = await api("/u/vod/search", { VodName: q }, ctx);
        if (!Array.isArray(rows)) throw new hg.PluginError("UPSTREAM_CHANGED", "搜索结果结构已变化");
        // 搜索接口一次返回全部结果（最多约 50 条），本地做截断，不伪造 next
        return { items: rows.map(toItem).filter(Boolean), next: null };
      },
      async trending(params, ctx) {
        const rows = await api("/u/vod/search/hotword", {}, ctx);
        return Array.isArray(rows) ? rows.map(String) : [];
      },
    },

    // ───────────────────── 详情与播放 ─────────────────────
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
              id: `${player.PlayerCode || "main"}|${i + 1}`,   // 线路 + 序号，稳定且唯一
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

        // 详情是播放解析的唯一数据源。宿主对同一会话会复用/合并请求，
        // 这里不再额外缓存到模块变量，避免跨调用状态污染。
        const detail = await api("/u/vod/detail", { VodID: vodId, SuggestCount: 0 }, ctx);
        const players = Array.isArray(detail?.Players) ? detail.Players : [];
        if (!players.length) throw new hg.PluginError("CONTENT_LOCKED", "该内容当前不可播放");

        // episodeId 形如 "bfzym3u8|12"
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

        // 上游标记 NeedParse 的地址交由 /u/vod/parse/url 解析
        let streamUrl = ep.Url;
        if (ep.NeedParse || player.NeedParse) {
          const parsed = await api("/u/vod/parse/url", {
            Url: ep.Url,
            PlayerCode: String(player.PlayerCode || ""),
          }, ctx);
          streamUrl = typeof parsed?.Url === "string" ? parsed.Url : "";
          if (!streamUrl) throw new hg.PluginError("CONTENT_LOCKED", "播放地址解析失败");
        }

        // refresh 时确保重取，不返回已知过期缓存
        if (reason === "refresh") hg.log.info("刷新播放地址", { mediaId, episodeId });

        const isHls = /\.m3u8(?:\?|$)/i.test(streamUrl);
        return {
          streams: [{
            url: streamUrl,                          // 上游原始地址，含中文路径
            kind: "media",
            format: isHls ? "hls" : "progressive",
            label: String(player.PlayerName || "默认线路"),
            serverId: String(player.PlayerCode || "main"),
          }],
          servers: players.map((p) => ({
            id: String(p.PlayerCode || "main"),
            label: String(p.PlayerName || "线路"),
          })),
          // 上游不返回 expiresAt，不能编造；宿主因此不会自动刷新
        };
      },
    },

    // ───────────────────── 评论（上游当前可能返回 System Failure，容错处理）─────────────────────
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
          // 上游评论服务不可用时静默返回空列表，不影响播放体验
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
