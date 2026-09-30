FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["node","src/mcp.mjs"]
