FROM node:12.18.0-alpine

WORKDIR /usr/src/app

RUN git clone https://github.com/pagopa/ade-aa-ms-mock.git /usr/src/app && \
         git checkout master && \
         yarn install && \
         yarn build

CMD ["yarn", "start"]
