import * as express from "express";
import { createAppTask } from "./app";

// Create a Proxy to forward local calls to spid validator container
const proxyApp = express();
proxyApp.get("*", (req, res) => {
  res.redirect("http://spid-saml-check:8080" + req.path);
});
proxyApp.listen(8080);
  
// tslint:disable-next-line: no-console
createAppTask.run().catch(e => console.error("Application error: ", e));

  
