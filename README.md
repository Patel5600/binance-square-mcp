# Binance Square ChatGPT MCP / Qube

Zero-dependency Node 20 service for Qube with three layers:

```
Web / X / Web3 research
        ↓
Qube analysis + quality loop
        ↓
Binance Square publishing
```

The Binance credential stays server-side:

```
BINANCE_SQUARE_OPENAPI_KEY=
```

The mobile Action uses a separate bearer secret:

```
MOBILE_POST_TOKEN=
```

There is no X API token in this project. Public X discovery uses the configured third-party public-data service.

## Mobile Action API

Existing endpoint, retained for backwards compatibility:

```
POST /api/publish
```

New media publishing:

```
POST /api/publish/images
POST /api/publish/video
```

Image publishing accepts HTTPS media URLs. Use `images` for 1–4 image posts, or `title` + `cover` for an image-cover article.

Video publishing accepts an HTTPS video URL and optional duration. The server can derive duration with ffprobe and creates a cover frame with ffmpeg.

X discovery:

```
GET /api/x/search?query=...
GET /api/x/trends?maxTrends=20
```

Specialized research:

```
GET /api/research/market?symbol=BTCUSDT&interval=1h&limit=24
GET /api/research/token?id=bitcoin
GET /api/research/defi?protocol=aave
```

All `/api/*` endpoints require the `MOBILE_POST_TOKEN` bearer token.

## MCP tools

The same capabilities are exposed through `/mcp`:

- `binance_square_publish_text`
- `binance_square_publish_images`
- `binance_square_publish_video`
- `x_get_trends`
- `x_search_posts`
- `research_market`
- `research_token`
- `research_defi`

## Health

```
GET /ping
GET /health
POST /mcp
```

## Docker

The image installs ffmpeg/ffprobe so video publishing can create a cover and derive duration.

```bash
docker build -t binance-square-mcp .
```

## Security

- Binance API key is never an LLM-facing argument and is never printed.
- Mobile endpoints require a bearer token.
- Remote media URLs must use HTTPS and resolve to public addresses.
- Image/video downloads are size-limited before publishing.
- Public X access uses no X API credential.
