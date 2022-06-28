import { envFlag } from "../../utils/misc";

// read all users and take any of them
const [user1] = require("./res/spidsamlcheck-conf/spid_users.json");

export const host = "http://localhost:9091";
export const testEntityID = "xx_validator";
export const showBrowser = envFlag(process.env.DEBUG);

export const testCredentials = [
  user1.username,
  user1.password,
  user1.fiscalNumber.split("-")[1],
];
export const spidLogStorage = {
         containerName: "spidassertions",
         connectionString:
           "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://localhost:10000/devstoreaccount1;QueueEndpoint=http://localhost:10001/devstoreaccount1;",
       };
