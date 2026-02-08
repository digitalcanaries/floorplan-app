FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server/ ./server/
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3080
CMD ["node", "server/index.js"]
