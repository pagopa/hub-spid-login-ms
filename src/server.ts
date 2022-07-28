import * as http from "http";
import { logger } from "./utils/logger";
import { createAppTask } from "./app";
import { initAppInsights } from "./utils/appinsights";
import { getConfigOrThrow } from "./utils/config";

logger.info(`ENV=${JSON.stringify(process.env)}`);

const config = getConfigOrThrow();
const appInsights = initAppInsights(config.APPINSIGHTS_INSTRUMENTATIONKEY, {
  disableAppInsights: config.APPINSIGHTS_DISABLED
});

// eslint-disable-next-line functional/immutable-data
appInsights.context.tags[appInsights.context.keys.cloudRole] =
  "hub-spid-login-ms";

createAppTask()
  .then(app => {
    http.createServer(app).listen(config.SERVER_PORT);
    // eslint-disable-next-line no-console
    console.log(`Server listening at port ${config.SERVER_PORT}`);
  })
  // eslint-disable-next-line no-console
  .catch(e => console.error("Application error: ", e));
