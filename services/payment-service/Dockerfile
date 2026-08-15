FROM node:18-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY infrastructure/ ./infrastructure/
COPY src/ ./src/
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1
CMD ["node", "src/index.js"]
