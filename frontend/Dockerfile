# Frontend production image: a static build served by nginx.
#
# VITE_API_URL is read at build time, not run time, so it is a build argument.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# The address the site is published at. It decides whether the build may be indexed: without
# it robots.txt disallows everything (vite.config.ts).
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# A single-page app: unknown paths are routes, not missing files. Those routes are the
# application, which no search engine should list; the landing at / and real files are not
# touched.
#
# Text is compressed here: the stock image leaves gzip off. Hashed files under /assets/ never
# change, so they cache for a year; the shell that names them is revalidated on every visit, or
# a browser would keep asking for the chunks of a build that is gone.
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  gzip on;\n\
  gzip_comp_level 6;\n\
  gzip_min_length 1024;\n\
  gzip_vary on;\n\
  gzip_types text/css text/plain application/javascript application/json image/svg+xml application/manifest+json application/xml;\n\
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }\n\
  location = /index.html { add_header Cache-Control "no-cache"; }\n\
  location / { try_files $uri $uri/ @spa; }\n\
  location @spa {\n\
    add_header X-Robots-Tag "noindex";\n\
    add_header Cache-Control "no-cache";\n\
    try_files /index.html =404;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
