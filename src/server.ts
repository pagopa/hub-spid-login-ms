import * as http from "http";
import { createAppTask } from "./app";
import { getConfigOrThrow } from "./utils/config";

const config = getConfigOrThrow();

// tslint:disable-next-line: no-let
let server: http.Server;
// tslint:disable-next-line: no-console
createAppTask
  .run()
  .then(app => {
    server = http.createServer(app).listen(config.SERVER_PORT);
    // tslint:disable-next-line: no-console
    console.log(`Server listening at port ${config.SERVER_PORT}`);
  })
  // tslint:disable-next-line: no-console
  .catch(e => console.error("Application error: ", e));
