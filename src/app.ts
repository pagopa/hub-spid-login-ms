import {
  AssertionConsumerServiceT,
  IApplicationConfig,
  IServiceProviderConfig,
  LogoutT,
  withSpid,
} from "@pagopa/io-spid-commons";
import { SamlAttributeT } from "@pagopa/io-spid-commons/dist/utils/saml";
import * as bodyParser from "body-parser";
import { debug } from "console";
import * as express from "express";
import { generateToken } from "./handlers/token";

import { ResponsePermanentRedirect } from "@pagopa/ts-commons/lib/responses";
import passport = require("passport");
import { SamlConfig } from "passport-saml";
import {
  accessLogHandler,
  errorHandler,
  metadataRefreshHandler,
  successHandler,
} from "./handlers/spid";
import {
  introspectHandler,
  invalidateHandler,
  upgradeTokenHandler,
} from "./handlers/token";
import { SpidUser, TokenUser, TokenUserL2 } from "./types/user";
import { getUserCompanies } from "./utils/attribute_authority";
import { getConfigOrThrow } from "./utils/config";
import {
  errorsToError,
  toCommonTokenUser,
  toResponseErrorInternal,
  toTokenUserL2,
} from "./utils/conversions";

import {
  AggregatorType,
  ContactType,
  EntityType,
} from "@pagopa/io-spid-commons/dist/utils/middleware";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
import { createBlobService } from "azure-storage";
import * as cors from "cors";
import { AdeAPIClient } from "./clients/ade";
import { healthcheckHandler } from "./handlers/general";
import { logger } from "./utils/logger";
import { REDIS_CLIENT } from "./utils/redis";
import { blurUser } from "./utils/user_registry";
import { pipe } from "fp-ts/lib/function";
import * as T from "fp-ts/lib/Task";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { CertificationEnum } from "../generated/pdv-userregistry-api/CertifiableFieldResourceOfLocalDate";
import { PersonalDatavaultAPIClient } from "./clients/pdv_client";

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
  spidLevelsWhitelist: ["SpidL1", "SpidL2", "SpidL3"],
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
            aggregatorType: AggregatorType.PublicServicesFullOperator,
          },
          phone: config.COMPANY_PHONE_NUMBER,
        },
      ]
    : undefined;

const serviceProviderConfig: IServiceProviderConfig = {
  contacts: getContactPersons(),

  IDPMetadataUrl: config.IDP_METADATA_URL,
  organization: {
    URL: config.ORG_URL,
    displayName: config.ORG_DISPLAY_NAME,
    name: config.ORG_NAME,
  },
  publicCert: config.METADATA_PUBLIC_CERT,
  requiredAttributes: {
    attributes: config.SPID_ATTRIBUTES.split(",").map(
      (item) => item as SamlAttributeT
    ),
    name: config.REQUIRED_ATTRIBUTES_SERVICE_NAME,
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
          [config.SPID_TESTENV_URL]: true,
        }
      : undefined,
};

const redisClient = REDIS_CLIENT;

process.on("SIGINT", () => {
  redisClient.quit();
});

const samlConfig: SamlConfig = {
  RACComparison: "minimum",
  acceptedClockSkewMs: 2000,
  attributeConsumingServiceIndex: "0",
  authnContext: config.AUTH_N_CONTEXT,
  callbackUrl: `${config.ACS_BASE_URL}${config.ENDPOINT_ACS}`,
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  issuer: config.ORG_ISSUER,
  logoutCallbackUrl: `${config.ACS_BASE_URL}/slo`,
  privateCert: config.METADATA_PRIVATE_CERT,
  validateInResponseTo: true,
};

const acs: AssertionConsumerServiceT = async (user) =>
  pipe(
    user,
    SpidUser.decode,
    TE.fromEither,
    TE.mapLeft((errs) => toResponseErrorInternal(errorsToError(errs))),
    TE.chain((_) => {
      logger.info("ACS | Trying to map user to Common User");
      return pipe(
        _,
        toCommonTokenUser,
        TE.fromEither,
        TE.mapLeft(toResponseErrorInternal)
      );
    }),
    (a) => a,
    TE.chain((_) => {
      logger.info(
        "ACS | Trying to retreive UserCompanies or map over a default user"
      );
      return config.ENABLE_ADE_AA
        ? pipe(
            getUserCompanies(
              AdeAPIClient(config.ADE_AA_API_ENDPOINT),
              _.fiscal_number
            ),
            TE.map((companies) => ({
              ..._,
              companies,
              from_aa: config.ENABLE_ADE_AA as boolean,
            }))
          )
        : TE.of({
            ..._,
            from_aa: config.ENABLE_ADE_AA as boolean,
          });
    }),
    (b) => b,
    TE.chainW((_) => {
      logger.info(
        `USER REGISTRY | Check for User Registry | ${config.ENABLE_USER_REGISTRY}`
      );
      return config.ENABLE_USER_REGISTRY
        ? pipe(
            blurUser(
              PersonalDatavaultAPIClient(config.USER_REGISTRY_URL),
              withoutUndefinedValues({
                fiscalCode: _.fiscal_number,
                ...(_.email && {
                  email: {
                    certification: CertificationEnum.SPID,
                    value: _.email,
                  },
                }),
                ...(_.family_name && {
                  familyName: {
                    certification: CertificationEnum.SPID,
                    value: _.family_name,
                  },
                }),
                ...(_.name && {
                  name: {
                    certification: CertificationEnum.SPID,
                    value: _.name,
                  },
                }),
              }),
              config.USER_REGISTRY_API_KEY
            ),
            TE.map((maybeUid) => ({
              ..._,
              uid: pipe(
                maybeUid,
                O.map((uid) => uid.id),
                O.toUndefined
              ),
            }))
          )
        : TE.of({ ..._ });
    }),
    TE.chainW((_) => {
      logger.info("ACS | Trying to decode TokenUser");
      return pipe(
        _,
        TokenUser.decode,
        TE.fromEither,
        TE.mapLeft((errs) => toResponseErrorInternal(errorsToError(errs)))
      );
    }),
    // If User is related to one company we can directly release an L2 token
    TE.chainW((a) => {
      logger.info("ACS | Companies length decision making");
      return a.from_aa
        ? a.companies.length === 1
          ? pipe(
              toTokenUserL2(a, a.companies[0]),
              TE.fromEither,
              TE.mapLeft(toResponseErrorInternal)
            )
          : TE.of(a as TokenUser | TokenUserL2)
        : pipe(
            TokenUserL2.decode({ ...a, level: "L2" }),
            TE.fromEither,
            TE.mapLeft((errs) => toResponseErrorInternal(errorsToError(errs)))
          );
    }),
    TE.chainW((tokenUser) => {
      logger.info("ACS | Generating token");
      return pipe(
        tokenUser,
        generateToken,
        TE.mapLeft(toResponseErrorInternal)
      );
    }),
    TE.mapLeft((_) => {
      logger.info(
        `ACS | Assertion Consumer Service ERROR|${_.kind} ${JSON.stringify(
          _.detail
        )}`
      );
      logger.error(
        `Assertion Consumer Service ERROR|${_.kind} ${JSON.stringify(_.detail)}`
      );
      return _;
    }),
    TE.map(({ tokenStr, tokenUser }) => {
      logger.info("ACS | Redirect to success endpoint");
      return config.ENABLE_ADE_AA && !TokenUserL2.is(tokenUser)
        ? ResponsePermanentRedirect({
            href: `${config.ENDPOINT_L1_SUCCESS}#token=${tokenStr}`,
          })
        : ResponsePermanentRedirect({
            href: `${config.ENDPOINT_SUCCESS}#token=${tokenStr}`,
          });
    }),
    TE.toUnion
  )();

const logout: LogoutT = async () =>
  ResponsePermanentRedirect({
    href: `${process.env.ENDPOINT_SUCCESS}?logout`,
  });

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
if (config.ALLOW_CORS) {
  logger.info("Enabling CORS on Express");
  app.use(cors());
}

const doneCb = config.ENABLE_SPID_ACCESS_LOGS
  ? accessLogHandler(
      createBlobService(config.SPID_LOGS_STORAGE_CONNECTION_STRING),
      config.SPID_LOGS_STORAGE_CONTAINER_NAME,
      config.SPID_LOGS_PUBLIC_KEY
    )
  : (ip: string | null, request: string, response: string) => {
      debug("*************** done", ip);
      debug(request);
      debug(response);
    };

/**
 * withSpidApp:
 * /login
 *
 */
export const createAppTask = pipe(
  withSpid({
    acs,
    app,
    appConfig,
    doneCb,
    logout,
    redisClient, // redisClient for authN request
    samlConfig,
    serviceProviderConfig,
  }),
  T.map(({ app: withSpidApp, idpMetadataRefresher }) => {
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
        ping: "pong",
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
          error: error.message,
        })
    );

    // tslint:disable-next-line: no-let prefer-const
    let countInterval = 0;
    const startIdpMetadataRefreshTimer = setInterval(() => {
      countInterval += 1;
      if (countInterval > 10) {
        clearInterval(startIdpMetadataRefreshTimer);
      }
      idpMetadataRefresher()().catch((e) => {
        logger.error("idpMetadataRefresher|error:%s", e);
      });
    }, 5000);
    withSpidApp.on("server:stop", () =>
      clearInterval(startIdpMetadataRefreshTimer)
    );

    return withSpidApp;
  })
);
