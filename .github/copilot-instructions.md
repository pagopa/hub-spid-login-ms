# Project Guidelines

## Build and Test

- Use Corepack-managed Yarn 4 in both workspaces. The repo targets Node 22.22.0 via `.node-version` and `e2e/.node-version`.
- Root workflow:
  - `corepack enable`
  - `yarn install --immutable`
  - `yarn build` to regenerate OpenAPI clients and compile TypeScript
  - `yarn test` for unit tests
  - `yarn lint` for ESLint
  - `yarn start` to run the compiled service from `dist/src/server.js`
  - `yarn docker:start` and `yarn docker:stop` for the local stack
- End-to-end tests live in `e2e/` and have their own lockfile and scripts:
  - `cd e2e && yarn install --immutable`
  - `cd e2e && yarn build`
  - `cd e2e && yarn start [scenario...]`
- Prefer root lint and unit tests for normal code changes. The e2e suite requires Docker, Puppeteer, and scenario setup.
- For local environment setup, certificates, hosts-file changes, and metadata refresh, see [README.md](../README.md) and [e2e/README.md](../e2e/README.md).

## Architecture

- `src/server.ts` is the runtime entrypoint. It initializes App Insights, builds the app, and starts the HTTP server.
- `src/app.ts` wires the Express app, `withSpid`, Redis, the SPID routes, token routes, healthcheck, and the periodic metadata refresh.
- Route handlers are split by responsibility:
  - `src/handlers/spid.ts` for ACS, metadata refresh, redirects, and SPID access logging
  - `src/handlers/token.ts` for token generation, introspection, invalidation, and L1 to L2 upgrade
  - `src/handlers/general.ts` for healthcheck behavior
- `src/utils/config.ts` is the single source of truth for environment variables. It validates config eagerly with `io-ts`; extend its codecs when adding new settings.
- External integrations are wrapped in `src/clients/`, but the actual clients are generated under `generated/`. Regenerate generated code instead of hand-editing it.

## Code Style

- Keep changes consistent with the existing TypeScript/CommonJS project layout: sources under `src/`, compiled output under `dist/`.
- Follow the established functional style with `pipe`, `Either`, `TaskEither`, and `Option` for validation and async error handling.
- Use `io-ts` decoders for request bodies, config, and typed external data instead of manual runtime checks when a codec already fits the boundary.
- Reuse shared conversion and error helpers from `src/utils/` instead of inventing new response shapes in handlers.

## Conventions

- Unit tests are colocated under `__tests__`, with reusable fixtures and mocks under `src/__mocks__` and `src/utils/__mocks__`.
- Unit tests load environment defaults through `src/__mocks__/setupEnvVars.ts`, which reads `.env.example`. Keep test env expectations aligned when config changes.
- When changing auth or routing behavior, update both the route registration in `src/app.ts` and the underlying handler and utility flow.
- When changing OpenAPI-based integrations, update the OpenAPI source and regeneration flow, not the generated client files.
- End-to-end coverage is scenario-based under `e2e/scenarios/`. Prefer copying a close scenario and keep ports unique across scenarios. See [e2e/README.md](../e2e/README.md) for the scenario contract.