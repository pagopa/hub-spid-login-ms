#!/usr/bin/env bash

mkdir -p certs

openssl req -nodes -new -x509 -sha256 -days 365 -newkey rsa:2048 \
    -config scripts/tls.conf \
    -keyout certs/key.pem -out certs/cert.pem
