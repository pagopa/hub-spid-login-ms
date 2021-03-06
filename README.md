# Hub SPID Login MicroService

This is a Microservice that is responsible to provide a single entry point for SPID authentication.

## How to launch
To run SPID Login microservice in a local environment you must:

- copy `.env.example` into `.env`
- Execute `scripts/make-certs.sh`
- Fill environment variables with your configuration
- Fill METADATA_PUBLIC_CERT with the content of certs/key.pem (generated by make-certs.sh)
- Fill METADATA_PRIVATE_CERT with the content of certs/cert.pem (generated by make-certs.sh)
- Take care and set the same value for SP `SERVER_PORT` and the metadata endpoint port registered in `spid-testenv2` config yaml
- add a row to hosts file `127.0.0.1 spid-testenv2`
- build the project by running `yarn build`
- Run `docker compose --env-file .env up --build` or `yarn docker:start`
- Call Endpoint to refresh IDP metadata e.g. `curl -L -X GET 'http://localhost:9090/refresh'`

## JWT Support

- Change ENABLE_JWT=true in `.env` file
- run `scripts/generate-rsa-jwt-key-pair.sh`
- copy `jwt-private-key.pem` into JWT_TOKEN_PRIVATE_KEY as single line \n

## CIE Support

- Add Preprod or Prod endpoint to the env file:
  Prod: https://produzione.idserver.servizicie.interno.gov.it/idp/shibboleth?Metadata
  PreProd: https://preproduzione.idserver.servizicie.interno.gov.it/idp/shibboleth?Metadata

## Assertion logging

It is possible to log SAML requests and responses for each successful login. Assertions are encrypted and stored in an external storage. This can be enabled by using the following environment configuration:
|name|description|values|required|
|-|-|-|-|
|`ENABLE_SPID_ACCESS_LOGS`|Whether log or not SAML assertions|`true` or `false`| yes|
|`SPID_LOGS_PUBLIC_KEY`|Key used to encypt SAML assertions payload| string | yes if `ENABLE_SPID_ACCESS_LOGS=true`|
|`SPID_LOGS_STORAGE_KIND`|The kind of storage to be used. Default: `azurestorage` for backward compatibility| See `config.ts` for all supported storages | yes if `ENABLE_SPID_ACCESS_LOGS=true`|
|`SPID_LOGS_STORAGE_CONTAINER_NAME`|Name of the container to store files into | string | yes if `ENABLE_SPID_ACCESS_LOGS=true`|

## Storage-specific configurations

Although configurations have been designed to be generic, each storage keeps its specificity

#### Specific configuration for `azurestorage`

| name                                  | description                                | values | required |
| ------------------------------------- | ------------------------------------------ | ------ | -------- |
| `SPID_LOGS_STORAGE_CONNECTION_STRING` | Connection string for the external storage | string | yes      |

#### Specific configuration for `awss3`

We use `AWS` SDK defaults for connecting to the storage. Please refer to the original docs. In addition, the following environment variables will be used:
| name | description | values | required |
| ------------------------------------- | ------------------------------------------ | ------ | ------------------------------------- |
| `SPID_LOGS_STORAGE_ENDPOINT` | Optional endpoint for target S3 service. Meant to be used in testing environments. If empty, `AWS`'s default will be used. We must provide a fully qualified ENDPOINT with URL, PROTOCOL, HOSTNAME | string | yes |
| `SPID_LOGS_STORAGE_CONTAINER_REGION` | Optional region for target S3 service. | yes |

# Architecture

This microservice is intended for usage through an API Gateway (API Management on Azure environment). It's necessary to enable:

- JWT Signature verification
- Additional header extraction throughout the backend services' authorization layer

## Routes

- `/metadata`: Expose SP metadata
- `/login`: Trigger a SPID login by creating an `authNRequest`
- `/logout`: Trigger logout from SPID (Not used)
- `/acs`: Assertion Consumer service endpoint
- `/refresh`: Trigger IDP metadata refresh
- `/invalidate`: Invalidates a previous released token
- `/introspect`: Introspect token by giving information (optional) about logged Spid User
- `/success`: Trigger Final redirect to success endpoint after a successful SPID login
- `/error`: Trigger Redirect to an error page

# Tests

## Unit tests

Just

```sh
yarn test
```

## End-to-end tests
Tests were executed using browser automation to simulate actual user interactions. See [e2e/README.md](e2e/README.md) for more.
