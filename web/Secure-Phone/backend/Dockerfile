FROM node:20-bookworm-slim

WORKDIR /app

# In case better-sqlite3 needs to compile native bindings
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python-is-python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
