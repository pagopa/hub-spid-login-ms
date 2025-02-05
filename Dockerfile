ARG NODE_VERSION=20.12.2
ARG OWNER=pagopa
ARG REPO=repo

FROM node:$NODE_VERSION-alpine as builder

WORKDIR /usr/src/build

COPY /package.json /usr/src/build/package.json
COPY /src /usr/src/build/src
COPY /generated /usr/src/build/generated
COPY /openapi /usr/src/build/openapi
COPY /yarn.lock /usr/src/build/yarn.lock
COPY /tsconfig.json /usr/src/build/tsconfig.json

RUN yarn install --ignore-scripts --frozen-lockfile\
  && yarn build

FROM node:$NODE_VERSION-alpine
LABEL maintainer="https://pagopa.it"
LABEL org.opencontainers.image.source https://github.com/$OWNER/$REPO

RUN addgroup -S nonroot \
  && adduser -S nonroot -G nonroot

WORKDIR /usr/src/app

COPY /package.json /usr/src/app/package.json
COPY --from=builder /usr/src/build/src /usr/src/app/src
COPY --from=builder /usr/src/build/dist /usr/src/app/dist
COPY --from=builder /usr/src/build/node_modules /usr/src/app/node_modules

USER nonroot

EXPOSE 9090
ENTRYPOINT ["node", "dist/src/server.js"]
