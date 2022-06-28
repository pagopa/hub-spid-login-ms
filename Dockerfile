ARG NODE_VERSION=14.17.6
ARG OWNER=pagopa
ARG REPO=repo

FROM node:$NODE_VERSION-alpine
LABEL maintainer="https://pagopa.it"
LABEL org.opencontainers.image.source https://github.com/$OWNER/$REPO

WORKDIR /usr/src/app

COPY /package.json /usr/src/app/package.json
COPY /dist /usr/src/app/dist
COPY /node_modules /usr/src/app/node_modules
COPY /generated /usr/src/app/generated

EXPOSE 9090

ENTRYPOINT ["node", "dist/src/server.js"]
