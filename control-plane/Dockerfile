# Cloud Run image for the control plane.
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.mjs"]
