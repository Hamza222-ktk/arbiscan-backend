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

# Expose port 7860 for Hugging Face Spaces
ENV PORT=7860
ENV NODE_ENV=production
ENV DB_TYPE=sqlite
ENV DB_DATABASE=db.sqlite

EXPOSE 7860

# Give user 1000 ownership and permissions of the directory for SQLite writes
RUN chown -R 1000:1000 /usr/src/app
USER 1000

CMD ["node", "dist/main"]
