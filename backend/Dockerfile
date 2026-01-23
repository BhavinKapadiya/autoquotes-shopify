# Build Stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Increase memory limit for build (uses swap if needed)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Production Stage
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Copy config folder (Required for Google Credentials)
# Ensure your google-service-account.json is in backend/config/
COPY config ./config

EXPOSE 5000

CMD ["npm", "start"]
