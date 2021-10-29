FROM node:10.14.2-alpine
LABEL maintainer="https://pagopa.gov.it"

WORKDIR /usr/src/app

COPY /package.json /usr/src/app/package.json
COPY /dist /usr/src/app/dist
COPY /node_modules /usr/src/app/node_modules
COPY /generated /usr/src/app/generated

EXPOSE 9090

ENTRYPOINT ["node", "dist/src/server.js"]
