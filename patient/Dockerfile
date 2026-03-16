# Common part to build everything
FROM node:22 AS builder
ENV VERSION=0.5.23
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN npm run build

FROM docker.io/nginxinc/nginx-unprivileged:1.28-bookworm as patient
RUN mkdir /etc/nginx/ssl/ && openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /etc/nginx/ssl/ssl-cert-snakeoil.key -out /etc/nginx/ssl/ssl-cert-snakeoil.pem -subj "/C=US/ST=California/L=San Francisco/O=My Company/OU=IT/CN=example.com"
COPY --from=builder /usr/src/app/www/ /usr/share/nginx/html/
COPY nginx /etc/nginx/templates/default.conf.template

