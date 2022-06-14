# E2E TEST SUITES

## How to run
### Quick start
First build `hub-spid-login` application in parent project, then

```sh
# install dependencies 
yarn install --frozen-lockfile

# build runner
yarn build

# execute all test suites
yarn start
```

> Build is needed only the first time or if something changes in the runner script, which most likely won't happen in normal test development process.
> Scenarios are built JIT when executed.

### Options
The following environment variable can be passed to the execution:

|name|accepted value|description|
|-|-|-|
|DEBUG|`true`|Show browser on screen when running automation scripts.|
|DRY_RUN|`true`|Instead of exdcuting commands, print them in console.|

## How it works
In `./runner` there's a script that:
* select all sceanarios to be run
* for each scenario, spawn processes for setup, test and teardown
* collect results and terminate accordingly (fail if at least one test fails)

Every folder in `./scenarios` is a single scenario, foldername being scenario name. Every scenario is created around a specific configuration for `hub-spid-login` application; that is:
* test cases for the same configuration go under the same scenario (example: login with both good and bad credentials)
* test cases for different configurations go under different scenarios (example: same login but with different storages for logging)

Tests use:
* `jest` for assertions and test runner
* `puppeteer` for browser automation
* `spid-saml-check` for having a running, fake IDP
* `docker-compose` to define apps configuration

Execution policy - _sequential, parallel, race, etc._ - is implemented by the runner, please check the actual implementation.

## Adding scenarios
The easier thing to do is to copy `basic` scenario into another and modify it as needed. In order for different scenarios to not conflicts on address, the following ports must be manually choose to be unique across scenarios:
* Port for `hub-spid-login` (`9090` in `basic` scenario). Set in:
  * `SERVER_PORT` variable on `./env.scenario`
  * `host` variable on `./config.ts`
  * `Location` attribute for `SingleLogoutService` and `AssertionConsumerService` tags in `./res/hsl-config/metadata.xml`
* Port for `spid-saml-check/demo` (`8088` in `basic` scenario). Set in:
  * `SPID_DEMO_IDP_PORT` variable on `./env.scenario`
  * `entityID` field on `./res/spidsamlcheck-config/idp_demo.json`
  * `host` and `port` field on `./spidsamlcheck-config/server.json`

Then, just edit `*.test.ts` files with all relevant tests.

### Scenario structure
The following files are expected to exist by the runner:
* `docker-compose.yml`
* `env.scenario`

The following are not mandatory (they depend on the actual implementation of `docker-compose.yml` and code), but are most likely to be present:
* `./res` contains static files to be mounted by applications
  * `./res/spidsamlcheck-config/` files to configure demo IDP
  * `./res/hsl-config/metadata.xml` files to configure `hub-spid-login`
* `config.ts` for all static variables in tests (example: the credentials of a fake user)
* `*.test.ts` with `jest` tests

> `jest` configuration is common for every scenario and is defined in `runner/jest.config.js`.



