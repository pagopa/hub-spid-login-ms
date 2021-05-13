FROM debian:buster
LABEL mantainer="Michele D'Amico, michele.damico@agid.gov.it"

# Update and install utilities
RUN apt-get update \
    && apt-get install -y \
        wget \
        curl \
        unzip \
        gcc \
        libxml2-utils \
        openssl \
        python3 \
        python3-pip \
        xmlsec1 \ 
        apache2 \
        git

# Node.js
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash - \
    && apt-get install -y \
        nodejs \
        build-essential

# Tox
RUN pip3 install tox

RUN git clone https://github.com/italia/spid-saml-check.git

# Set the working directory
WORKDIR /spid-saml-check

# Create directory for tests data
RUN mkdir /spid-saml-check/specs-compliance-tests/data

ENV \
    TZ=Europe/Rome \
    DATA_DIR=/spid-saml-check/specs-compliance-tests/data \
    SP_METADATA=/spid-saml-check/specs-compliance-tests/data/sp-metadata.xml \
    AUTHN_REQUEST=/spid-saml-check/specs-compliance-tests/data/authn-request.xml

COPY /idp.json /spid-saml-check/spid-validator/config/idp.json

# Build validator
RUN cd /spid-saml-check/spid-validator && \
    cd client && npm install --silent && cd .. && \
    cd server && npm install --silent && cd .. && \
    npm run build

# Ports exposed
EXPOSE 8080


ENTRYPOINT cd spid-validator && npm run start-prod
