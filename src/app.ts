import { debug } from "console";
import {
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
import * as cors from "cors";
import { pipe } from "fp-ts/lib/function";
import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import * as TE from "fp-ts/TaskEither";
import * as T from "fp-ts/Task";
import {
  accessLogHandler,
  getAcs,
  errorHandler,
  metadataRefreshHandler,
  successHandler
} from "./handlers/spid";
import {
  getIntrospectHandler,
  getInvalidateHandler,
  upgradeTokenHandler
} from "./handlers/token";
import { getConfigOrThrow } from "./utils/config";
import { getHealthcheckHandler } from "./handlers/general";
import { logger } from "./utils/logger";
import { CreateRedisClientTask } from "./utils/redis";
import {
  createAccessLogEncrypter,
  createAccessLogWriter,
  createMakeSpidLogBlobName
} from "./utils/access_log";

const config = getConfigOrThrow();

export const appConfig: IApplicationConfig<never> = {
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
      createAccessLogEncrypter(config),
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
  CreateRedisClientTask,
  TE.chainTaskK(REDIS_CLIENT => {
    process.on("SIGINT", () => {
      REDIS_CLIENT.quit().catch(err =>
        logger.error(`Error closing the redis connection: [${err}]`)
      );
    });
    return pipe(
      withSpid({
        acs: getAcs(config, REDIS_CLIENT),
        app,
        appConfig,
        doneCb,
        logout,
        redisClient: REDIS_CLIENT, // redisClient for authN request
        samlConfig,
        serviceProviderConfig
      }),
      T.map(_ => ({ ..._, REDIS_CLIENT }))
    );
  }),
  TE.map(({ app: withSpidApp, idpMetadataRefresher, REDIS_CLIENT }) => {
    withSpidApp.get(config.ENDPOINT_SUCCESS, successHandler);

    if (config.ENABLE_ADE_AA) {
      withSpidApp.get(config.ENDPOINT_L1_SUCCESS, successHandler);
      withSpidApp.post(
        "/upgradeToken",
        upgradeTokenHandler(config, REDIS_CLIENT)
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

    withSpidApp.get("/healthcheck", getHealthcheckHandler(REDIS_CLIENT));

    withSpidApp.post("/introspect", getIntrospectHandler(config, REDIS_CLIENT));

    withSpidApp.post("/invalidate", getInvalidateHandler(config, REDIS_CLIENT));

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
