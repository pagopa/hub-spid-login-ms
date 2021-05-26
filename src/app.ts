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

import {
  AggregatorType,
  ContactType,
  EntityType
} from "@pagopa/io-spid-commons/dist/utils/middleware";
import { AdeAPIClient } from "./clients/ade";
import { healthcheckHandler } from "./handlers/general";
import { logger } from "./utils/logger";
import { REDIS_CLIENT } from "./utils/redis";

const config = getConfigOrThrow();

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

const getContactPersons = () =>
  config.ENABLE_FULL_OPERATOR_METADATA
    ? [
        {
          company: config.COMPANY_NAME,
          contactType: ContactType.OTHER,
          email: config.COMPANY_EMAIL,
          entityType: EntityType.AGGREGATOR,
          extensions: {
            FiscalCode: config.COMPANY_FISCAL_CODE,
            IPACode: config.COMPANY_IPA_CODE,
            VATNumber: config.COMPANY_VAT_NUMBER,
            aggregatorType: AggregatorType.PublicServicesFullOperator
          },
          phone: config.COMPANY_PHONE_NUMBER
        }
      ]
    : undefined;

const serviceProviderConfig: IServiceProviderConfig = {
  contacts: getContactPersons(),

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
    name: config.REQUIRED_ATTRIBUTES_SERVICE_NAME
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

process.on("SIGINT", () => {
  redisClient.quit();
});

const samlConfig: SamlConfig = {
  RACComparison: "minimum",
  acceptedClockSkewMs: -1,
  attributeConsumingServiceIndex: "0",
  authnContext: config.AUTH_N_CONTEXT,
  callbackUrl: `${config.ACS_BASE_URL}${config.ENDPOINT_ACS}`,
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  issuer: config.ORG_ISSUER,
  logoutCallbackUrl: `${config.ACS_BASE_URL}/slo`,
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
        config.ENABLE_ADE_AA
          ? getUserCompanies(
              AdeAPIClient(config.ADE_AA_API_ENDPOINT),
              _.fiscal_number
            ).map(companies => ({
              ..._,
              companies,
              from_aa: config.ENABLE_ADE_AA
            }))
          : taskEither.of({ ..._, from_aa: config.ENABLE_ADE_AA })
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
          : fromEither(
              TokenUserL2.decode({ ..._, level: "L2" })
            ).mapLeft(errs => toResponseErrorInternal(errorsToError(errs)))
      )
      .chain(tokenUser =>
        generateToken(tokenUser).mapLeft(toResponseErrorInternal)
      )
      .fold<
        | IResponseErrorInternal
        | IResponseErrorForbiddenNotAuthorized
        | IResponsePermanentRedirect
      >(
        _ => {
          logger.error(
            `Assertion Consumer Service ERROR|${_.kind} ${_.detail}`
          );
          return _;
        },
        ({ tokenStr, tokenUser }) =>
          config.ENABLE_ADE_AA && !TokenUserL2.is(tokenUser)
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
  withSpidApp.get(config.ENDPOINT_SUCCESS, successHandler);

  if (config.ENABLE_ADE_AA) {
    withSpidApp.get(config.ENDPOINT_L1_SUCCESS, successHandler);
    withSpidApp.post(
      "/upgradeToken",
      upgradeTokenHandler(config.L1_TOKEN_HEADER_NAME)
    );
  }
  withSpidApp.get("/error", errorHandler);
  withSpidApp.get("/refresh", metadataRefreshHandler(idpMetadataRefresher));
  // Add info endpoint
  withSpidApp.get("/info", async (_, res) => {
    res.json({
      ping: "pong"
    });
  });

  withSpidApp.get("/healthcheck", healthcheckHandler(redisClient));

  withSpidApp.post("/introspect", introspectHandler);

  withSpidApp.post("/invalidate", invalidateHandler);

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

  // tslint:disable-next-line: no-let prefer-const
  let countInterval = 0;
  const startIdpMetadataRefreshTimer = setInterval(() => {
    countInterval += 1;
    if (countInterval > 10) {
      clearInterval(startIdpMetadataRefreshTimer);
    }
    idpMetadataRefresher()
      .run()
      .catch(e => {
        logger.error("idpMetadataRefresher|error:%s", e);
      });
  }, 5000);
  withSpidApp.on("server:stop", () =>
    clearInterval(startIdpMetadataRefreshTimer)
  );

  return withSpidApp;
});
