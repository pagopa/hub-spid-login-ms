#!/usr/bin/env bash
openssl ecparam -name secp256k1 -genkey -noout -out jwt-private-key.pem
openssl ec -in jwt-private-key.pem -pubout > jwt-pub-key.pem