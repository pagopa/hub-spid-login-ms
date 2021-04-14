import {
  AssertionConsumerServiceT,
  IApplicationConfig,
  LogoutT,
  withSpid
} from "@pagopa/io-spid-commons";
import {
  IResponsePermanentRedirect,
  ResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import * as bodyParser from "body-parser";
import { debug } from "console";
import * as crypto from "crypto";
import * as express from "express";
import { identity } from "fp-ts/lib/function";
import { fromEither, fromPredicate, taskEither } from "fp-ts/lib/TaskEither";
import * as fs from "fs";

import {
  IResponseErrorInternal,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import passport = require("passport");
import { SamlConfig } from "passport-saml";
import { SpidUser } from "./spid/spid";
import { getConfigOrThrow } from "./utils/config";
import { errorsToError } from "./utils/conversions";
import { getSpidUserJwt } from "./utils/jwt";
import { IServiceProviderConfig } from "./utils/middleware";
import { REDIS_CLIENT } from "./utils/redis";
import { getTask, setWithExpirationTask } from "./utils/redis_storage";
import { SamlAttributeT } from "./utils/saml";

const config = getConfigOrThrow();

export const SESSION_TOKEN_PREFIX = "session-token:";

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

const redisGetSpidUser = (userKey: string) =>
  getTask(redisClient, userKey).chain(_ =>
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
  return fromEither(SpidUser.decode(user))
    .mapLeft(errorsToError)
    .chain(spidUser =>
      config.ENABLE_JWT
        ? getSpidUserJwt(
            config.JWT_TOKEN_PRIVATE_KEY,
            spidUser,
            config.JWT_TOKEN_EXPIRATION,
            config.JWT_TOKEN_ISSUER
          )
        : taskEither
            .of<Error, string>(crypto.randomBytes(32).toString("hex"))
            .chain(token =>
              setWithExpirationTask(
                redisClient,
                `${SESSION_TOKEN_PREFIX}${token}`,
                JSON.stringify(spidUser),
                3600
              ).map(() => token)
            )
    )
    .fold<IResponseErrorInternal | IResponsePermanentRedirect>(
      err => ResponseErrorInternal(err.message),
      _ =>
        ResponsePermanentRedirect({
          href: `${config.ENDPOINT_SUCCESS}?token=${_}`
        })
    )
    .run();
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
    await redisGetSpidUser(`${SESSION_TOKEN_PREFIX}${req.body.token}`)
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
