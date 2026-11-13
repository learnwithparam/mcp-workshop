# Build from the root of the course repo, so the image has the world and the packages:
#   docker build -f parts/04-defend-and-ship/03-deploy-the-server/wrong/fixed-public-url/Dockerfile -t harrow-lane .
# Run it on your machine, the same way a host runs it:
#   docker run --rm -p 8787:8787 -e PUBLIC_URL=http://127.0.0.1:8787/mcp harrow-lane
FROM oven/bun:1.4.4
WORKDIR /app

# Packages first, so Docker can reuse this layer when only the code changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# The image keeps the repo's folder layout, so the imports work the same as on your machine.
COPY world ./world
COPY parts/04-defend-and-ship/03-deploy-the-server/wrong/fixed-public-url ./parts/04-defend-and-ship/03-deploy-the-server/wrong/fixed-public-url

ENV PORT=8787
EXPOSE 8787
CMD ["bun", "parts/04-defend-and-ship/03-deploy-the-server/wrong/fixed-public-url/serve.ts"]
