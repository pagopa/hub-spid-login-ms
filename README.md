# Hub SPID Login MicroService
This is a Microservice that is responsible to provide a single entry point for SPID authentication.

## Routes
* `/metadata`: Expose SP metadata
* `/login`: Trigger a SPID login by creating an `authNRequest`
* `/logout`: Trigger logout from SPID (Not used)
* `/acs`: Assertion Consumer service endpoint
* `/refresh`: Trigger IDP metadata refresh
* `/invalidate`: Invalidates a previous released token
* `/introspect`: Introspect token by giving information (optional) about logged Spid User
* `/success`: Final redirec to success endpoint after a successful SPID login

## How to launch
In order to run SPID Login microservice in a local environment you must:
- copy `.env.example` into `.env`
- Fill environment variables with your own configuration
- build the project by running `yarn build`
- Run `docker compose up --build` 
