import {
  AssertionConsumerServiceT,
  IApplicationConfig,
  IServiceProviderConfig,
  LogoutT,
  withSpid
} from "@pagopa/io-spid-commons";
import { SamlAttributeT } from "@pagopa/io-spid-commons/dist/utils/saml";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponsePermanentRedirect
} from "@pagopa/ts-commons/lib/responses";
import * as bodyParser from "body-parser";
import { debug } from "console";
import * as express from "express";
import { identity } from "fp-ts/lib/function";
import { fromEither, taskEither } from "fp-ts/lib/TaskEither";
import { generateToken } from "./handlers/token";

import {
  IResponseErrorInternal,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import passport = require("passport");
import { SamlConfig } from "passport-saml";
import {
  errorHandler,
  metadataRefreshHandler,
  successHandler
} from "./handlers/spid";
import {
  introspectHandler,
  invalidateHandler,
  upgradeTokenHandler
} from "./handlers/token";
import { SpidUser, TokenUser, TokenUserL2 } from "./types/user";
import { getUserCompanies } from "./utils/attribute_authority";
import { getConfigOrThrow } from "./utils/config";
import {
  errorsToError,
  toCommonTokenUser,
  toResponseErrorInternal,
  toTokenUserL2
} from "./utils/conversions";

import { REDIS_CLIENT } from "./utils/redis";

const config = getConfigOrThrow();

export const DEFAULT_OPAQUE_TOKEN_EXPIRATION = 3600;
export const SESSION_TOKEN_PREFIX = "session-token:";
export const SESSION_INVALIDATE_TOKEN_PREFIX = "session-token-invalidate:";

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
  publicCert: config.METADATA_PUBLIC_CERT,
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

const samlConfig: SamlConfig = {
  RACComparison: "minimum",
  acceptedClockSkewMs: 0,
  attributeConsumingServiceIndex: "0",
  authnContext: config.AUTH_N_CONTEXT,
  callbackUrl: `${config.ORG_URL}${config.ENDPOINT_ACS}`,
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  issuer: config.ORG_ISSUER,
  logoutCallbackUrl: `${config.ORG_URL}/slo`,
  privateCert: config.METADATA_PRIVATE_CERT,
  validateInResponseTo: true
};

const acs: AssertionConsumerServiceT = async user => {
  return (
    fromEither(SpidUser.decode(user))
      .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
        errs => toResponseErrorInternal(errorsToError(errs))
      )
      .chain(_ =>
        fromEither(toCommonTokenUser(_)).mapLeft(toResponseErrorInternal)
      )
      .chain(_ =>
        config.ENABLE_AA
          ? getUserCompanies(
              config.AA_API_ENDPOINT,
              config.AA_API_METHOD,
              _.fiscal_number
            ).map(companies => ({ ..._, companies, from_aa: config.ENABLE_AA }))
          : taskEither.of({ ..._, from_aa: config.ENABLE_AA })
      )
      .chain(_ =>
        fromEither(TokenUser.decode(_)).mapLeft(errs =>
          toResponseErrorInternal(errorsToError(errs))
        )
      )
      // If User is related to one company we can directly release an L2 token
      .chain<TokenUser | TokenUserL2>(_ =>
        _.from_aa
          ? _.companies.length === 1
            ? fromEither(
                toTokenUserL2(_, _.companies[0]).mapLeft(
                  toResponseErrorInternal
                )
              )
            : taskEither.of(_)
          : fromEither(TokenUserL2.decode(_)).mapLeft(errs =>
              toResponseErrorInternal(errorsToError(errs))
            )
      )
      .chain(tokenUser =>
        generateToken(tokenUser).mapLeft(toResponseErrorInternal)
      )
      .fold<
        | IResponseErrorInternal
        | IResponseErrorForbiddenNotAuthorized
        | IResponsePermanentRedirect
      >(identity, ({ tokenStr, tokenUser }) =>
        config.ENABLE_AA && !TokenUserL2.is(tokenUser)
          ? ResponsePermanentRedirect({
              href: `${config.ENDPOINT_L1_SUCCESS}#token=${tokenStr}`
            })
          : ResponsePermanentRedirect({
              href: `${config.ENDPOINT_SUCCESS}#token=${tokenStr}`
            })
      )
      .run()
  );
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
  withSpidApp.get("/success", successHandler);
  withSpidApp.get("/success/l1", successHandler);
  withSpidApp.get("/error", errorHandler);
  withSpidApp.get("/refresh", metadataRefreshHandler(idpMetadataRefresher));
  // Add info endpoint
  withSpidApp.get("/info", async (_, res) => {
    res.json({
      ping: "pong"
    });
  });

  withSpidApp.post("/introspect", introspectHandler);

  withSpidApp.post("/invalidate", invalidateHandler);

  withSpidApp.post("/upgradeToken", upgradeTokenHandler);

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
  return withSpidApp;
});
