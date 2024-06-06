import { envFlag } from "../../utils/misc";

// read all users and take any of them
const [user1] = require("./res/spidsamlcheck-conf/spid_users.json");

export const host = "http://localhost:9092";
export const testEntityID = "xx_validator";
export const showBrowser = envFlag(process.env.DEBUG);

export const testCredentials = [
  user1.username,
  user1.password,
  user1.fiscalNumber.split("-")[1]
];
export const spidLogStorage = {
  containerName: "spidassertions",
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  region: "us-east-1",
  endpoint: { url: new URL("http://localhost:10000/") },
  forcePathStyle: true
};
