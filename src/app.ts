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
import * as crypto from "crypto";
import * as express from "express";
import { parseJSON } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  taskEither
} from "fp-ts/lib/TaskEither";

import {
  IResponseErrorInternal,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import passport = require("passport");
import { SamlConfig } from "passport-saml";
import { UpgradeTokenBody } from "./types/request";
import { SpidUser, TokenUser, TokenUserL2 } from "./types/user";
import { getUserCompanies } from "./utils/attribute_authority";
import { getConfigOrThrow } from "./utils/config";
import {
  errorsToError,
  mapDecoding,
  toCommonTokenUser,
  toResponseErrorInternal,
  toTokenUserL2
} from "./utils/conversions";
import {
  extractJwtRemainingValidTime,
  extractRawDataFromJwt,
  getUserJwt
} from "./utils/jwt";

import { REDIS_CLIENT } from "./utils/redis";
import {
  deleteTask,
  existsKeyTask,
  getTask,
  setWithExpirationTask
} from "./utils/redis_storage";

const config = getConfigOrThrow();

const DEFAULT_OPAQUE_TOKEN_EXPIRATION = 3600;
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

const getRawTokenUserFromRedis = (token: string, res: express.Response) =>
  getTask(redisClient, `${SESSION_TOKEN_PREFIX}${token}`)
    .mapLeft(() => res.status(500).json("Error while retrieving token"))
    .chain(maybeToken =>
      maybeToken.foldL(
        () =>
          // tslint:disable-next-line: no-any
          fromLeft(res.status(404).json("Token not found")),
        rawToken =>
          fromEither(
            parseJSON(rawToken, err =>
              res.status(500).json({
                detail: String(err),
                error: "Error parsing token"
              })
            )
          )
      )
    );

const generateToken = (tokenUser: TokenUser | TokenUserL2) =>
  config.ENABLE_JWT
    ? getUserJwt(
        config.JWT_TOKEN_PRIVATE_KEY,
        tokenUser,
        config.JWT_TOKEN_EXPIRATION,
        config.JWT_TOKEN_ISSUER
      ).bimap(
        () => new Error("Error generating JWT Token"),
        _ => ({ tokenUser, tokenStr: _ })
      )
    : taskEither
        .of<Error, string>(crypto.randomBytes(32).toString("hex"))
        .chain(_ =>
          setWithExpirationTask(
            redisClient,
            `${SESSION_TOKEN_PREFIX}${_}`,
            JSON.stringify(tokenUser),
            DEFAULT_OPAQUE_TOKEN_EXPIRATION
          ).bimap(
            () => new Error("Error storing Opaque Token"),
            () => ({
              tokenStr: _,
              tokenUser
            })
          )
        );

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
              href: `${config.ENDPOINT_L1_SUCCESS}?token=${tokenStr}`
            })
          : ResponsePermanentRedirect({
              href: `${config.ENDPOINT_SUCCESS}?token=${tokenStr}`
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
  const successHandler = (req, res) =>
    res.json({
      success: "success",
      token: req.query.token
    });
  withSpidApp.get("/success", successHandler);
  withSpidApp.get("/success/l1", successHandler);
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
  // Add info endpoint
  withSpidApp.get("/info", async (_, res) => {
    res.json({
      ping: "pong"
    });
  });

  withSpidApp.post("/introspect", async (req, res) => {
    // first check if token is blacklisted
    await existsKeyTask(
      redisClient,
      `${SESSION_INVALIDATE_TOKEN_PREFIX}${req.body.token}`
    )
      .mapLeft(() => res.status(500).json("Cannot introspect token"))
      .chain(
        fromPredicate(
          _ => _ === false,
          () =>
            res.status(403).json({
              active: false
            })
        )
      )
      .chain(
        fromPredicate(
          () => !config.ENABLE_JWT,
          () => void 0
        )
      )
      // if token is a JWT we must check only if this jwt is blacklisted
      .mapLeft(() => res.status(200).json({ active: true }))
      .chain(() =>
        getRawTokenUserFromRedis(req.body.token, res)
          .chain<TokenUser | TokenUserL2>(_ =>
            TokenUserL2.is(_)
              ? mapDecoding(TokenUserL2, _).mapLeft(e =>
                  res.status(500).json({
                    detail: String(e),
                    error: "Error decoding L2 token"
                  })
                )
              : mapDecoding(TokenUser, _).mapLeft(e =>
                  res.status(500).json({
                    detail: String(e),
                    error: "Error decoding L1 token"
                  })
                )
          )

          .chain(
            fromPredicate(
              () => config.INCLUDE_SPID_USER_ON_INTROSPECTION,
              _ => res.status(200).json({ active: true, level: _.level })
            )
          )
          .map(tokenUser => ({
            active: true,
            level: tokenUser.level,
            user: tokenUser
          }))
      )
      .fold(identity, _ => res.status(200).json(_))
      .run();
  });

  withSpidApp.post("/invalidate", async (req, res) => {
    await taskEither
      .of(config.ENABLE_JWT)
      .chain(jwtEnabled =>
        jwtEnabled
          ? extractJwtRemainingValidTime(
              req.body.token
            ).chain(remainingExpTime =>
              setWithExpirationTask(
                redisClient,
                `${SESSION_INVALIDATE_TOKEN_PREFIX}${req.body.token}`,
                "true",
                remainingExpTime
              )
            )
          : deleteTask(redisClient, `${SESSION_TOKEN_PREFIX}${req.body.token}`)
      )
      .mapLeft(() => res.status(500).json("Error while invalidating Token"))
      .fold(identity, _ => res.status(200).json(_))
      .run();
  });

  withSpidApp.post("/upgradeToken", async (req, res) => {
    await fromEither(UpgradeTokenBody.decode(req.body))
      .bimap(
        errs =>
          res.status(400).json({
            error: "Invalid Request",
            message: String(errorsToError(errs))
          }),
        _ => ({
          jwtEnabled: config.ENABLE_JWT,
          organizationFiscalCode: _.organization_fiscal_code,
          rawToken: _.token
        })
      )
      .chain(({ jwtEnabled, organizationFiscalCode, rawToken }) =>
        jwtEnabled
          ? taskEither.of({
              organizationFiscalCode,
              rawTokenUser: extractRawDataFromJwt(rawToken)
            })
          : getRawTokenUserFromRedis(req.body.token, res).map(_ => ({
              organizationFiscalCode,
              rawTokenUser: _
            }))
      )
      .chain(({ rawTokenUser, organizationFiscalCode }) =>
        fromEither(
          TokenUser.decode(rawTokenUser).mapLeft(() =>
            res
              .status(400)
              .json("Cannot upgrade Token because it is not an L1 Token")
          )
        ).chain<TokenUserL2>(tokenUser =>
          tokenUser.from_aa
            ? fromNullable(
                tokenUser.companies.find(
                  e => e.organization_fiscal_code === organizationFiscalCode
                )
              ).foldL(
                () => fromLeft(res.status(404).json("Organization Not Found")),
                _ =>
                  fromEither(toTokenUserL2(tokenUser, _)).mapLeft(() =>
                    res.status(500).json("Error decoding L2 Token")
                  )
              )
            : fromLeft(
                res
                  .status(500)
                  .json(
                    "Cannot upgrade a token not granted by an Authorization Authority"
                  )
              )
        )
      )
      .chain(tokenUserL2 =>
        generateToken(tokenUserL2).mapLeft(err =>
          res
            .status(500)
            .json({ detail: err.message, error: "Error generating L2 Token" })
        )
      )
      .fold(identity, _ => res.status(200).json({ token: _.tokenStr }))
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
  return withSpidApp;
});
