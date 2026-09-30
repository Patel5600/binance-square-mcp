# Binance Square ChatGPT Plugin

A small, zero-dependency MCP app designed to be connected to ChatGPT as a custom plugin.

The intended workflow is:

```
You: "Find what's trending on X and post the useful one on Binance Square."

ChatGPT
  -> x_get_trends
  -> x_search_posts
  -> writes the post
  -> binance_square_publish_text
```

No manual MCP commands are required after the app is connected.

## Tools

### X
- `x_get_trends` - current X trends by WOEID. Worldwide is WOEID `1`.
- `x_search_posts` - recent public X posts for understanding a trend.

### Binance Square
- `binance_square_publish_text`
- `binance_square_publish_images`
- `binance_square_publish_video`
- `binance_square_auth_status`

The X trend endpoint is X API v2's Trends by WOEID endpoint. It requires an X developer App bearer token. X documents the endpoint as real-time, location-specific trend data. citeturn3view0

## Environment

Set these in the machine/container running the MCP server:

```
BINANCE_SQUARE_OPENAPI_KEY=
X_BEARER_TOKEN=
PORT=8787
HOST=0.0.0.0
```

Never send either secret as an MCP tool argument and never commit them.

## Run locally

### Stdio

```bash
npm start
```

### Remote HTTP MCP

```npm
npm run http
```

The MCP endpoint is:

```
https://YOUR-HOST/mcp
```

Health check:

```
https://YOUR-HOST/health
```

For ChatGPT, the server needs to be reachable through HTTPS, or through the supported Secure MCP Tunnel. OpenAI's current plugin documentation describes connecting a custom MCP server by its `/mcp` endpoint. citeturn0search5

## Connect to ChatGPT

1. Deploy or tunnel this repository so the HTTP server is reachable.
2. Copy the HTTPS `/mcp` URL.
3. In ChatGPT, open the custom plugin/app connection flow.
4. Add the MCP URL.
5. Enable the plugin in the chat where you want to use it.
6. Test with:

```
Find what's trending on X and post a concise useful Binance Square update.
```

ChatGPT can then choose `x_get_trends`, inspect recent posts with `x_search_posts`, draft the content, and call the Square publishing tool.

## Important

This server deliberately does not invent X trends or scrape random third-party trend sites. It uses X's official API when `X_BEARER_TOKEN` is configured.

Binance publishing follows the Binance Square OpenAPI workflow.

The current implementation keeps the original stdio mode so the same project can also be used by local MCP clients.

## Development

```bash
npm run check
```

The repository CI runs the same syntax check on pushes and pull requests.
