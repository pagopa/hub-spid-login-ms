# Hub SPID Login MicroService
This is a Microservice that is responsible to provide a single entry point for SPID authentication.

## How to launch
In order to run SPID Login microservice in a local environment you must:
- copy `.env.example` into `.env`
- Execute `scripts/make-certs.sh`
- Fill environment variables with your own configuration
- build the project by running `yarn build`
- Run `docker compose up --build` 

## JWT Support

- Change ENABLE_JWT=true in `.env` file
- run `scripts/generate-jwt-key-pair.sh`
- copy `jwt-private-key.pem` into JWT_TOKEN_PRIVATE_KEY as single line \n
