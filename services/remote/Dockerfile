FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY core.mjs server.mjs ./
ENV HOST=0.0.0.0 PORT=3001
USER node
EXPOSE 3001
CMD ["node", "server.mjs"]
