#!/usr/bin/env bash

mkdir -p certs

# TLS spidtest-env2
openssl req -nodes -new -x509 -sha256 -days 365 -newkey rsa:2048 \
    -config scripts/tls.conf \
    -keyout certs/certificate.pem -out certs/certificate.crt

# METADATA CERT
openssl req -nodes -new -x509 -sha256 -days 365 -newkey rsa:2048 \
    -subj "/C=IT/ST=State/L=City/O=Acme Inc. /OU=IT Department/CN=spid-express.selfsigned.example" \
    -keyout certs/key.pem -out certs/cert.pem
