# Builder stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY . .
RUN apk add make 
RUN make
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
COPY .env.example .env

RUN chmod +x ./entrypoint.sh

EXPOSE 3000 5555

ENTRYPOINT ["./entrypoint.sh"]
CMD ["yarn", "start:prod"]
