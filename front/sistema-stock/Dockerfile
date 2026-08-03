# Etapa de build
FROM node:20 AS builder
WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Etapa de producción con nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
