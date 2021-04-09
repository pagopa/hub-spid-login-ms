import { IApplicationConfig, withSpid } from "@pagopa/io-spid-commons";
import * as bodyParser from "body-parser";
import { debug } from "console";
import * as crypto from "crypto";
import * as express from "express";
import * as fs from "fs";
import * as t from "io-ts";
import { ResponsePermanentRedirect } from "italia-ts-commons/lib/responses";
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "italia-ts-commons/lib/strings";
import passport = require("passport");
import { SamlConfig } from "passport-saml";
import * as redis from "redis";
import { promisify } from "util";
import { AssertionConsumerServiceT, LogoutT } from "./spid/spid";
import { IServiceProviderConfig } from "./utils/middleware";
import { SamlAttributeT } from "./utils/saml";

export const SpidUser = t.intersection([
  t.interface({
    // the following values may be set
    // by the calling application:
    // authnContextClassRef: SpidLevel,
    // issuer: Issuer
    getAssertionXml: t.Function
  }),
  t.partial({
    email: EmailString,
    familyName: t.string,
    fiscalNumber: FiscalCode,
    mobilePhone: NonEmptyString,
    name: t.string,
    nameID: t.string,
    nameIDFormat: t.string,
    sessionIndex: t.string
  })
]);

export type SpidUser = t.TypeOf<typeof SpidUser>;

export const appConfig: IApplicationConfig = {
  assertionConsumerServicePath: process.env.ENDPOINT_ACS,
  // clientErrorRedirectionUrl: CLIENT_ERROR_REDIRECTION_URL,
  // clientLoginRedirectionUrl: CLIENT_REDIRECTION_URL,
  clientErrorRedirectionUrl: process.env.ENDPOINT_ERROR,
  clientLoginRedirectionUrl: process.env.ENDPOINT_ERROR,
  loginPath: process.env.ENDPOINT_LOGIN,
  metadataPath: process.env.ENDPOINT_METADATA,
  sloPath: process.env.ENDPOINT_LOGOUT,
  spidLevelsWhitelist: ["SpidL1", "SpidL2", "SpidL3"]
  // startupIdpsMetadata: STARTUP_IDPS_METADATA
};

const serviceProviderConfig: IServiceProviderConfig = {
  IDPMetadataUrl:
    "https://registry.spid.gov.it/metadata/idp/spid-entities-idps.xml",
  organization: {
    URL: process.env.ORG_URL,
    displayName: process.env.ORG_DISPLAY_NAME,
    name: process.env.ORG_NAME
  },
  publicCert: fs.readFileSync(process.env.METADATA_PUBLIC_CERT, "utf-8"),
  requiredAttributes: {
    attributes: process.env.SPID_ATTRIBUTES?.split(",").map(
      item => item as SamlAttributeT
    ),
    name: "Required attrs"
  },
  spidCieUrl:
    "https://preproduzione.idserver.servizicie.interno.gov.it/idp/shibboleth?Metadata",
  spidTestEnvUrl: process.env.SPID_TESTENV_URL,
  spidValidatorUrl: process.env.SPID_VALIDATOR_URL,
  strictResponseValidation: {
    [process.env.SPID_VALIDATOR_URL]: true,
    [process.env.SPID_TESTENV_URL]: true
  }
};

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST // Can't work in production
});

const redisGetAsync = promisify(redisClient.get).bind(redisClient);

const samlConfig: SamlConfig = {
  RACComparison: "minimum",
  acceptedClockSkewMs: 0,
  attributeConsumingServiceIndex: "0",
  authnContext: process.env.AUTH_N_CONTEXT,
  callbackUrl: `${process.env.ORG_URL}${process.env.ENDPOINT_ACS}`,
  // decryptionPvk: fs.readFileSync("./certs/key.pem", "utf-8"),
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  issuer: process.env.ORG_ISSUER,
  logoutCallbackUrl: `${process.env.ORG_URL}/slo`,
  privateCert: fs.readFileSync(process.env.METADATA_PRIVATE_CERT, "utf-8"),
  validateInResponseTo: true
};

const acs: AssertionConsumerServiceT = async user => {
  /* Should validate the user */
  // Create token
  const token = crypto.randomBytes(32).toString("hex");

  // Write token in redis
  redisClient.set(
    `session-token:${token}`,
    JSON.stringify(user),
    "EX",
    3600, // expire sec 1 h
    (err, response) => new Error("Error setting session token")
  );

  // Add token in query string
  return ResponsePermanentRedirect({
    href: `${process.env.ENDPOINT_SUCCESS}?token=${token}`
  });
};

const logout: LogoutT = async () =>
  ResponsePermanentRedirect({
    href: `${process.env.ENDPOINT_SUCCESS}?logout`
  });

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());

const doneCb = (ip: string | null, request: string, response: string) => {
  debug("*************** done", ip);
  debug(request);
  debug(response);
};

/**
 * withSpidApp:
 * /login
 *
 */
export const createAppTask = withSpid({
  acs,
  app,
  appConfig,
  doneCb,
  logout,
  redisClient, // redisClient for authN request
  samlConfig,
  serviceProviderConfig
}).map(({ app: withSpidApp, idpMetadataRefresher }) => {
  withSpidApp.get("/success", (req, res) => {
    return res.json({
      success: "success",
      token: req.query.token
    });
  });
  withSpidApp.get("/error", (_, res) =>
    res
      .json({
        error: "error"
      })
      .status(400)
  );
  withSpidApp.get("/refresh", async (_, res) => {
    await idpMetadataRefresher().run();
    res.json({
      metadataUpdate: "completed"
    });
  });
  withSpidApp.post("/introspect", async (req, res) => {
    res.json({
      active: (await redisGetAsync(`session-token:${req.body.token}`)) !== null
    });
  });
  withSpidApp.use(
    (
      error: Error,
      _: express.Request,
      res: express.Response,
      ___: express.NextFunction
    ) =>
      res.status(505).send({
        error: error.message
      })
  );
  withSpidApp.listen(3000);
});
