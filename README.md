# vocab-agent（Cloudflare Pages 部署版）

线上地址：<https://vocab-agent-8tb.pages.dev>

## 结构

```
public/                     静态前端（来自原仓库 templates/ + static/，未改动）
functions/api/clean.js      替代 app.py 的 Pages Function，路由 POST /api/clean
wrangler.toml               Pages 配置
```

## 更新发布

在 Git Bash 中执行：

```bash
cd E:/AI-claude/vocab-agent-pages
export npm_config_cache="E:/AI-claude/.npm-cache"
npx wrangler pages deploy public --project-name vocab-agent --branch main
```

## 说明

- 免费档：不休眠，10 万请求/天，无需绑卡
- DeepSeek API Key 由浏览器端提供，不保存在服务端
- `.wrangler/` 是本地部署缓存，不要提交
