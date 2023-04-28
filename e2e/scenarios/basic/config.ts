import { envFlag } from "../../utils/misc";

export const host = "http://127.0.0.1:9090";
export const testEntityID = "xx_validator";
export const showBrowser = envFlag(process.env.DEBUG);
// see users.json in conf-testenv directory defined for the current spid-testenv instance
export const testCredentials = ["ada", "password123"];
