#!/usr/bin/env bash
openssl genrsa -out jwt_rsa_key.pem 2048
openssl rsa -in jwt_rsa_key.pem -outform PEM -pubout -out jwt_rsa_public.pem