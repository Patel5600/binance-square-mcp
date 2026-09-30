# binance-square-mcp

Zero-dependency MCP server for publishing new content to Binance Square through the Square OpenAPI.

## Implemented

- Text posts
- Articles without media
- Image posts with 1-4 images
- Articles with one cover image
- Secure auth status with masked key
- MCP stdio transport
- Video publishing with ffmpeg cover extraction and Binance processing polling

Video requires ffmpeg to be installed on the machine running the MCP server.

## Requirements

Node.js 20+, a Binance Square OpenAPI key, and network access.

Set the key in the MCP process environment:

Linux/WSL:
    export BINANCE_SQUARE_OPENAPI_KEY='...'

PowerShell:
    $env:BINANCE_SQUARE_OPENAPI_KEY='...'

Never commit the real key or put it in tool arguments.

## Run

    npm start

## MCP config

    {
      "mcpServers": {
        "binance-square": {
          "command": "node",
          "args": ["/ABSOLUTE/PATH/binance-square-mcp/src/mcp.mjs"],
          "env": {
            "BINANCE_SQUARE_OPENAPI_KEY": "$BINANCE_SQUARE_OPENAPI_KEY"
          }
        }
      }
    }

## Tools

- binance_square_publish_text
- binance_square_publish_images
- binance_square_publish_video
- binance_square_auth_status

## Security

The LLM-facing tools never accept the API key. The server resolves it from the environment or the standard local key file. The secret is never printed.

## Upstream reference

https://github.com/binance/binance-skills-hub/tree/main/skills/binance/square-post
