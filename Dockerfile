# --- Build Stage ---
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:18-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/tsconfig.json ./tsconfig.json

ENV PORT=3000
ENV NODE_ENV=production
ENV DB_TYPE=sqlite
ENV DB_DATABASE=db.sqlite

EXPOSE 3000

CMD ["node", "dist/main"]
