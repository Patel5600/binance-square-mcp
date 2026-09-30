# Binance Square ChatGPT MCP

Personal ChatGPT-connected MCP for:

```
public X discovery
      ↓
ChatGPT decides what is useful
      ↓
Binance Square post
```

Only Binance Square requires a secret:

```
BINANCE_SQUARE_OPENAPI_KEY=
```

There is **no X API token** in this project.

## Tools

- `x_get_trends` - discovers current trend-like topics from public X search data.
- `x_search_posts` - reads public X search results for a topic.
- `binance_square_publish_text`
- `binance_square_publish_images`
- `binance_square_publish_video`
- `binance_square_auth_status`

The public X reader uses the public `x.pcstyle.dev` agent-oriented interface. It is a third-party public-data service, not an official X API, so availability can change. urlx.pcstyle.devhttps://x.pcstyle.dev/

## Docker

Build:

```bash
docker build -t binance-square-mcp .
```

Run:

```bash
docker run --rm -p 8787:8787 \
  -e BINANCE_SQUARE_OPENAPI_KEY='YOUR_KEY' \
  binance-square-mcp
```

Or:

```bash
BINANCE_SQUARE_OPENAPI_KEY='YOUR_KEY' docker compose up -d --build
```

## Endpoints

```
GET  /health
GET  /ping
POST /mcp
```

`/ping` returns a tiny JSON response suitable for uptime checks.

## GitHub Actions

Every push to `main`:

1. Runs the Node syntax CI.
2. Builds a Docker image.
3. Publishes the image to GitHub Container Registry.
4. Deploys the small static landing page in `docs/` to GitHub Pages.

### Important GitHub Pages limitation

GitHub Pages is static hosting. It **does not run Docker containers or a persistent Node MCP server**. citeturn0search0

Therefore:

```
GitHub Pages
└── landing page / documentation

GHCR
└── Docker image

Actual MCP host
└── runs the Docker container
    ├── /ping
    ├── /health
    └── /mcp
```

The Docker image is automatically published to:

```
ghcr.io/Patel5600/binance-square-mcp:latest
```

You still need a machine/container host to actually keep that image running. GitHub Pages cannot be that runtime.

## ChatGPT connection

Once the container is running on a reachable HTTPS host, connect:

```
https://YOUR-HOST/mcp
```

Then the intended conversation is simply:

> Find what's trending on X and post a useful update on Binance Square.

ChatGPT can call the discovery tools and then the Binance publishing tool without you manually invoking MCP commands.

## Security

The Binance key is resolved only from the server environment or the standard local Binance key file.

It is never exposed as an LLM-facing tool argument and is never printed.

Do not commit the real key.
