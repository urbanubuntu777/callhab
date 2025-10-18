# Build stage for client
FROM node:18-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./
RUN npm ci --only=production

# Copy server code
COPY server/ ./

# Copy built client files
COPY --from=client-builder /app/client/dist ./public

# Expose port
EXPOSE 5000

# Start command
CMD ["node", "index.js"]
