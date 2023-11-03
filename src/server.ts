import * as http from "http";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/Either";
import { createAppTask } from "./app";
import { initAppInsights } from "./utils/appinsights";
import { getConfigOrThrow } from "./utils/config";
import { logger } from "./utils/logger";

const config = getConfigOrThrow();
const appInsights = initAppInsights(config.APPINSIGHTS_INSTRUMENTATIONKEY, {
  disableAppInsights: config.APPINSIGHTS_DISABLED
});

// eslint-disable-next-line functional/immutable-data
appInsights.context.tags[appInsights.context.keys.cloudRole] =
  "hub-spid-login-ms";

createAppTask()
  .then(errorOrApp => {
    pipe(
      errorOrApp,
      E.map(app => {
        const server = http.createServer(app);
        // eslint-disable-next-line functional/immutable-data
        server.keepAliveTimeout = 62 * 1000;

        server.listen(config.SERVER_PORT);
        logger.info(`Server listening at port ${config.SERVER_PORT}`);
      }),
      E.mapLeft(error => {
        logger.error(`Error starting the App: [${error}]`);
      })
    );
  })
  .catch(e => logger.error("Application error: ", e));
