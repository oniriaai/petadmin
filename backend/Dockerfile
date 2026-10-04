# Backend production image.
#
# The dev stack runs `npm install && npm run dev` against a mounted source tree, which is
# exactly what a production host must not do. This builds once, drops the dev dependencies and
# runs the compiled output as a non-root user.

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.seed.json tsconfig.prod-seed.json ./
COPY src ./src
# The server, then the seed emitted separately: tsconfig.seed.json only typechecks, so
# without build:seed the image would have no seed to provision the superadmin with.
RUN npm run build && npm run build:seed

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The generated client is a build artefact, so it is copied rather than regenerated.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY prisma ./prisma
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
