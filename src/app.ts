import { IApplicationConfig, withSpid } from "@pagopa/io-spid-commons";
import * as bodyParser from "body-parser";
import { debug } from "console";
import * as crypto from "crypto";
import * as express from "express";
import { toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromEither, fromPredicate, tryCatch } from "fp-ts/lib/TaskEither";
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
import { promisify } from "util";
import { AssertionConsumerServiceT, LogoutT } from "./spid/spid";
import { getConfigOrThrow } from "./utils/config";
import { errorsToError } from "./utils/conversions";
import { IServiceProviderConfig } from "./utils/middleware";
import { REDIS_CLIENT } from "./utils/redis";
import { SamlAttributeT } from "./utils/saml";

const config = getConfigOrThrow();

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
  assertionConsumerServicePath: config.ENDPOINT_ACS,
  // clientErrorRedirectionUrl: CLIENT_ERROR_REDIRECTION_URL,
  // clientLoginRedirectionUrl: CLIENT_REDIRECTION_URL,
  clientErrorRedirectionUrl: config.ENDPOINT_ERROR,
  clientLoginRedirectionUrl: config.ENDPOINT_ERROR,
  loginPath: config.ENDPOINT_LOGIN,
  metadataPath: config.ENDPOINT_METADATA,
  sloPath: config.ENDPOINT_LOGOUT,
  spidLevelsWhitelist: ["SpidL1", "SpidL2", "SpidL3"]
  // startupIdpsMetadata: STARTUP_IDPS_METADATA
};

const serviceProviderConfig: IServiceProviderConfig = {
  IDPMetadataUrl:
    "https://registry.spid.gov.it/metadata/idp/spid-entities-idps.xml",
  organization: {
    URL: config.ORG_URL,
    displayName: config.ORG_DISPLAY_NAME,
    name: config.ORG_NAME
  },
  publicCert: fs.readFileSync(process.env.METADATA_PUBLIC_CERT, "utf-8"),
  requiredAttributes: {
    attributes: config.SPID_ATTRIBUTES.split(",").map(
      item => item as SamlAttributeT
    ),
    name: "Required attrs"
  },
  spidCieUrl:
    "https://preproduzione.idserver.servizicie.interno.gov.it/idp/shibboleth?Metadata",
  spidTestEnvUrl: config.SPID_TESTENV_URL,
  spidValidatorUrl: config.SPID_VALIDATOR_URL,
  strictResponseValidation:
    config.SPID_TESTENV_URL !== undefined &&
    config.SPID_VALIDATOR_URL !== undefined
      ? {
          [config.SPID_VALIDATOR_URL]: true,
          [config.SPID_TESTENV_URL]: true
        }
      : undefined
};

const redisClient = REDIS_CLIENT;

const redisGetAsync = promisify(redisClient.get).bind(redisClient);

const redisGetSpidUser = (userKey: string) =>
  tryCatch(() => redisGetAsync(userKey), toError).chain(_ =>
    fromEither(SpidUser.decode(_).mapLeft(errorsToError))
  );

const samlConfig: SamlConfig = {
  RACComparison: "minimum",
  acceptedClockSkewMs: 0,
  attributeConsumingServiceIndex: "0",
  authnContext: config.AUTH_N_CONTEXT,
  callbackUrl: `${config.ORG_URL}${config.ENDPOINT_ACS}`,
  // decryptionPvk: fs.readFileSync("./certs/key.pem", "utf-8"),
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  issuer: config.ORG_ISSUER,
  logoutCallbackUrl: `${config.ORG_URL}/slo`,
  privateCert: fs.readFileSync(config.METADATA_PRIVATE_CERT, "utf-8"),
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
    (_, __) => new Error("Error setting session token")
  );

  // Add token in query string
  return ResponsePermanentRedirect({
    href: `${config.ENDPOINT_SUCCESS}?token=${token}`
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
    await redisGetSpidUser(`session-token:${req.body.token}`)
      .mapLeft(() =>
        res.json({
          active: false
        })
      )
      .chain(
        fromPredicate(
          () => config.INCLUDE_SPID_USER_ON_INTROSPECTION,
          () => res.json({ active: true })
        )
      )
      .map(spidUser => ({ active: true, user: spidUser }))
      .fold(identity, _ => res.json(_))
      .run();
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
