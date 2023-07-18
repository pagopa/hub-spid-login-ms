import { debug } from "console";
import {
  AssertionConsumerServiceT,
  IApplicationConfig,
  IServiceProviderConfig,
  LogoutT,
  withSpid
} from "@pagopa/io-spid-commons";
import { SamlAttributeT } from "@pagopa/io-spid-commons/dist/utils/saml";
import * as bodyParser from "body-parser";
import * as express from "express";
import { ResponsePermanentRedirect } from "@pagopa/ts-commons/lib/responses";
import * as passport from "passport";
import { SamlConfig } from "passport-saml";
import {
  AggregatorType,
  ContactType,
  EntityType
} from "@pagopa/io-spid-commons/dist/utils/middleware";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
import * as cors from "cors";
import { pipe } from "fp-ts/lib/function";
import * as T from "fp-ts/lib/Task";
import * as TE from "fp-ts/lib/TaskEither";
import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import { CertificationEnum } from "../generated/pdv-userregistry-api/CertifiableFieldResourceOfLocalDate";
import { generateToken } from "./handlers/token";

import {
  accessLogHandler,
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
  toRequestId,
  toResponseErrorInternal,
  toTokenUserL2
} from "./utils/conversions";
import { AdeAPIClient } from "./clients/ade";
import { healthcheckHandler } from "./handlers/general";
import { logger } from "./utils/logger";
import { REDIS_CLIENT } from "./utils/redis";
import { blurUser } from "./utils/user_registry";
import { PersonalDatavaultAPIClient } from "./clients/pdv_client";
import {
  createAccessLogEncrypter,
  createAccessLogWriter,
  createMakeSpidLogBlobName
} from "./utils/access_log";

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
  // eslint-disable-next-line extra-rules/no-commented-out-code
  // startupIdpsMetadata: STARTUP_IDPS_METADATA
};

const getContactPersons = (): IServiceProviderConfig["contacts"] =>
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
  IDPMetadataUrl: config.IDP_METADATA_URL,
  contacts: getContactPersons(),

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
  spidCieUrl: config.CIE_URL,
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
  acceptedClockSkewMs: 2000,
  attributeConsumingServiceIndex: "0",
  authnContext: config.AUTH_N_CONTEXT,
  callbackUrl: `${config.ACS_BASE_URL}${config.ENDPOINT_ACS}`,
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
  issuer: config.ORG_ISSUER,
  logoutCallbackUrl: `${config.ACS_BASE_URL}/slo`,
  privateCert: config.METADATA_PRIVATE_CERT,
  validateInResponseTo: true
};

const acs: AssertionConsumerServiceT = async user =>
  pipe(
    user,
    SpidUser.decode,
    TE.fromEither,
    TE.mapLeft(errs => toResponseErrorInternal(errorsToError(errs))),
    TE.chain(spidUser => {
      logger.info("ACS | Trying to map user to Common User");
      return pipe(
        spidUser,
        toCommonTokenUser,
        TE.fromEither,
        TE.mapLeft(toResponseErrorInternal)
      );
    }),
    TE.chain(commonUser => {
      logger.info(
        "ACS | Trying to retreive UserCompanies or map over a default user"
      );
      return config.ENABLE_ADE_AA
        ? pipe(
            getUserCompanies(
              AdeAPIClient(config.ADE_AA_API_ENDPOINT),
              commonUser.fiscal_number
            ),
            TE.map(companies => ({
              ...commonUser,
              companies,
              from_aa: config.ENABLE_ADE_AA as boolean
            }))
          )
        : TE.of({
            ...commonUser,
            from_aa: config.ENABLE_ADE_AA as boolean
          });
    }),
    TE.chainW(commonUser => {
      logger.info(
        `ACS | Personal Data Vault - Check for User: ${config.ENABLE_USER_REGISTRY}`
      );
      return config.ENABLE_USER_REGISTRY
        ? pipe(
            blurUser(
              PersonalDatavaultAPIClient(config.USER_REGISTRY_URL),
              withoutUndefinedValues({
                fiscalCode: commonUser.fiscal_number,
                ...(commonUser.email && {
                  email: {
                    certification: CertificationEnum.SPID,
                    value: commonUser.email
                  }
                }),
                ...(commonUser.family_name && {
                  familyName: {
                    certification: CertificationEnum.SPID,
                    value: commonUser.family_name
                  }
                }),
                ...(commonUser.name && {
                  name: {
                    certification: CertificationEnum.SPID,
                    value: commonUser.name
                  }
                })
              }),
              config.USER_REGISTRY_API_KEY
            ),
            TE.map(uuid => ({
              ...commonUser,
              uid: uuid.id
            }))
          )
        : TE.of({ ...commonUser });
    }),
    TE.chainW(commonUser => {
      logger.info("ACS | Trying to decode TokenUser");
      return pipe(
        commonUser,
        TokenUser.decode,
        TE.fromEither,
        TE.mapLeft(errs => toResponseErrorInternal(errorsToError(errs)))
      );
    }),
    // If User is related to one company we can directly release an L2 token
    TE.chainW(tokenUser => {
      logger.info("ACS | Companies length decision making");
      return tokenUser.from_aa
        ? tokenUser.companies.length === 1
          ? pipe(
              toTokenUserL2(tokenUser, tokenUser.companies[0]),
              TE.fromEither,
              TE.mapLeft(toResponseErrorInternal)
            )
          : TE.of(tokenUser as TokenUser | TokenUserL2)
        : pipe(
            TokenUserL2.decode({ ...tokenUser, level: "L2" }),
            TE.fromEither,
            TE.mapLeft(errs => toResponseErrorInternal(errorsToError(errs)))
          );
    }),
    TE.chainW(tokenUser => {
      logger.info("ACS | Generating token");
      const requestId =
        config.ENABLE_JWT && config.JWT_TOKEN_JTI_SPID
          ? toRequestId(user as Record<string, unknown>)
          : undefined;
      return pipe(
        generateToken(tokenUser, requestId),
        TE.mapLeft(toResponseErrorInternal)
      );
    }),
    TE.mapLeft(error => {
      logger.info(
        `ACS | Assertion Consumer Service ERROR|${error.kind} ${JSON.stringify(
          error.detail
        )}`
      );
      logger.error(
        `Assertion Consumer Service ERROR|${error.kind} ${JSON.stringify(
          error.detail
        )}`
      );
      return error;
    }),
    TE.map(({ tokenStr, tokenUser }) => {
      logger.info("ACS | Redirect to success endpoint");
      return config.ENABLE_ADE_AA && !TokenUserL2.is(tokenUser)
        ? ResponsePermanentRedirect(({
            href: `${config.ENDPOINT_L1_SUCCESS}#token=${tokenStr}`
          } as unknown) as ValidUrl)
        : ResponsePermanentRedirect(({
            href: `${config.ENDPOINT_SUCCESS}#token=${tokenStr}`
          } as unknown) as ValidUrl);
    }),
    TE.toUnion
  )();

const logout: LogoutT = async () =>
  ResponsePermanentRedirect(({
    href: `${process.env.ENDPOINT_SUCCESS}?logout`
  } as unknown) as ValidUrl);

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// there's a little bug that does not recognixe express.Handler
// as an extension of RequestHandler, so we need to cast it
app.use(passport.initialize() as express.RequestHandler);

if (config.ALLOW_CORS) {
  logger.info("Enabling CORS on Express");
  app.use(cors());
}

const doneCb = config.ENABLE_SPID_ACCESS_LOGS
  ? accessLogHandler(
      createAccessLogWriter(config),
      createAccessLogEncrypter(config.SPID_LOGS_PUBLIC_KEY),
      createMakeSpidLogBlobName(config)
    )
  : (ip: string | null, request: string, response: string): void => {
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
    serviceProviderConfig
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

    // eslint-disable-next-line functional/no-let, prefer-const
    let countInterval = 0;
    const startIdpMetadataRefreshTimer = setInterval(() => {
      countInterval += 1;
      if (countInterval > 10) {
        clearInterval(startIdpMetadataRefreshTimer);
      }
      idpMetadataRefresher()().catch(e => {
        logger.error("idpMetadataRefresher|error:%s", e);
      });
    }, 5000);
    withSpidApp.on("server:stop", () =>
      clearInterval(startIdpMetadataRefreshTimer)
    );

    return withSpidApp;
  })
);
