FROM node:12.18.1

WORKDIR /usr/src/app

RUN git clone https://github.com/pagopa/ade-aa-ms-mock.git /usr/src/app && \
         git checkout master && \
         yarn install && \
         yarn generate && \
         yarn build

CMD ["yarn", "start"]
