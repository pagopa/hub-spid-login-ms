import * as crypto from "crypto";
import * as express from "express";
import {
  INonNegativeIntegerTag,
  NonNegativeInteger
} from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { flow, pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as T from "fp-ts/lib/Task";
import * as O from "fp-ts/lib/Option";
import * as J from "fp-ts/Json";
import * as b from "fp-ts/boolean";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import * as redis from "redis";
import {
  deleteTask,
  existsKeyTask,
  getTask,
  setWithExpirationTask
} from "../utils/redis_storage";
import {
  extractJwtRemainingValidTime,
  extractRawDataFromJwt,
  getUserJwt
} from "../utils/jwt";
import { toBadRequest, toTokenUserL2 } from "../utils/conversions";
import { EnabledAttributeAuthorityParams, IConfig } from "../utils/config";
import { TokenUser, TokenUserL2 } from "../types/user";
import { UpgradeTokenBody } from "../types/request";

const SESSION_TOKEN_PREFIX = "session-token:";
const SESSION_INVALIDATE_TOKEN_PREFIX = "session-token-invalidate:";

const getRawTokenUserFromRedis = (
  token: string,
  res: express.Response,
  redisClient: redis.RedisClientType | redis.RedisClusterType
): TE.TaskEither<express.Response, J.Json> =>
  pipe(
    getTask(redisClient, `${SESSION_TOKEN_PREFIX}${token}`),
    a => a,
    TE.mapLeft(() => res.status(500).json("Error while retrieving token")),
    TE.chain(maybeToken =>
      pipe(
        maybeToken,
        O.fold(
          () => TE.left(res.status(404).json("Token not found")),
          value =>
            pipe(
              value,
              J.parse,
              E.mapLeft(e =>
                res.status(500).json({
                  detail: String(e),
                  error: "Error parsing token"
                })
              ),
              TE.fromEither
            )
        )
      )
    )
  );

export const getTokenExpiration = (config: IConfig) => (
  tokenUser: TokenUser | TokenUserL2
): number & INonNegativeIntegerTag =>
  config.ENABLE_ADE_AA === true
    ? TokenUser.is(tokenUser)
      ? config.L1_TOKEN_EXPIRATION
      : config.L2_TOKEN_EXPIRATION
    : config.TOKEN_EXPIRATION;

export const getGenerateToken = (
  config: IConfig,
  redisClient: redis.RedisClusterType | redis.RedisClientType
) => (
  tokenUser: TokenUser | TokenUserL2,
  requestId?: NonEmptyString
): TE.TaskEither<
  Error,
  {
    readonly tokenStr: string;
    readonly tokenUser: TokenUser | TokenUserL2;
  }
> =>
  pipe(
    TE.of<Error, NonNegativeInteger>(getTokenExpiration(config)(tokenUser)),
    TE.chain(tokenExpiration =>
      config.ENABLE_JWT
        ? pipe(
            getUserJwt(
              config.JWT_TOKEN_PRIVATE_KEY,
              tokenUser,
              tokenExpiration,
              config.JWT_TOKEN_ISSUER,
              config.JWT_TOKEN_KID,
              config.JWT_TOKEN_AUDIENCE,
              requestId
            ),
            TE.mapLeft(
              e => new Error("Error generating JWT Token " + e.message)
            ),
            TE.map(_ => ({ tokenStr: _, tokenUser }))
          )
        : pipe(
            TE.of<Error, string>(crypto.randomBytes(32).toString("hex")),
            TE.chain(_ =>
              pipe(
                setWithExpirationTask(
                  redisClient,
                  `${SESSION_TOKEN_PREFIX}${_}`,
                  JSON.stringify(tokenUser),
                  tokenExpiration
                ),
                TE.mapLeft(() => new Error("Error storing Opaque Token")),
                TE.map(() => ({
                  tokenStr: _,
                  tokenUser
                }))
              )
            )
          )
    )
  );

export const getIntrospectHandler = (
  config: IConfig,
  redisClient: redis.RedisClusterType | redis.RedisClientType
) => async (
  req: express.Request,
  res: express.Response
): Promise<express.Response> =>
  pipe(
    // first check if token is blacklisted
    existsKeyTask(
      redisClient,
      `${SESSION_INVALIDATE_TOKEN_PREFIX}${req.body.token}`
    ),
    TE.mapLeft(() => res.status(500).json("Cannot introspect token")),
    TE.chain(
      TE.fromPredicate(
        _ => _ === false,
        () =>
          res.status(403).json({
            active: false
          })
      )
    ),
    TE.chain(
      TE.fromPredicate(
        () => !config.ENABLE_JWT,
        () => res.status(200).json({ active: true })
      )
    ),
    TE.chain(() => getRawTokenUserFromRedis(req.body.token, res, redisClient)),
    // ensure raw token is in the correct shape
    TE.chain(
      flow(
        t.union([TokenUser, TokenUserL2]).decode,
        E.mapLeft(e =>
          res.status(500).json({
            detail: readableReport(e),
            error: "Error decoding token"
          })
        ),
        TE.fromEither
      )
    ),
    TE.chain(token =>
      pipe(
        token,
        TE.fromPredicate(
          () => config.INCLUDE_SPID_USER_ON_INTROSPECTION,
          _ => res.status(200).json({ active: true, level: token.level })
        )
      )
    ),
    TE.map(tokenUser => ({
      active: true,
      level: tokenUser.level,
      user: tokenUser
    })),
    TE.fold(
      _ => T.of(_),
      _ => T.of(res.status(200).json(_))
    )
  )();

export const getInvalidateHandler = (
  config: IConfig,
  redisClient: redis.RedisClusterType | redis.RedisClientType
) => async (
  req: express.Request,
  res: express.Response // first check if token is blacklisted
): Promise<E.Either<never, express.Response>> =>
  pipe(
    TE.of(config.ENABLE_JWT),
    TE.chain(jwtEnabled =>
      jwtEnabled
        ? pipe(
            extractJwtRemainingValidTime(req.body.token),
            TE.chain(remainingExpTime =>
              setWithExpirationTask(
                redisClient,
                `${SESSION_INVALIDATE_TOKEN_PREFIX}${req.body.token}`,
                "true",
                remainingExpTime.exp
              )
            )
          )
        : deleteTask(redisClient, `${SESSION_TOKEN_PREFIX}${req.body.token}`)
    ),
    TE.fold(
      () => TE.of(res.status(500).json("Error while invalidating Token")),
      _ => TE.of(res.status(200).json(_))
    )
  )();

export const upgradeTokenHandler = (
  config: IConfig & EnabledAttributeAuthorityParams,
  redisClient: redis.RedisClusterType | redis.RedisClientType
) => async (
  req: express.Request,
  res: express.Response
): Promise<express.Response> => {
  const fromErrToBadRequest = toBadRequest(res);
  return pipe(
    req.body,
    UpgradeTokenBody.decode,
    E.mapLeft(fromErrToBadRequest),
    TE.fromEither,
    TE.chain(body =>
      pipe(
        req.headers[config.L1_TOKEN_HEADER_NAME],
        NonEmptyString.decode,
        TE.fromEither,
        TE.mapLeft(e =>
          fromErrToBadRequest(
            e,
            `Missing required header ${config.L1_TOKEN_HEADER_NAME}`
          )
        ),
        TE.map(header => ({
          jwtEnabled: config.ENABLE_JWT,
          organizationFiscalCode: body.organization_fiscal_code,
          rawToken: header
        }))
      )
    ),
    TE.chain(({ jwtEnabled, organizationFiscalCode, rawToken }) =>
      pipe(
        jwtEnabled,
        b.fold(
          () =>
            pipe(
              getRawTokenUserFromRedis(req.body.token, res, redisClient),
              TE.map(_ => ({
                organizationFiscalCode,
                rawTokenUser: _
              }))
            ),
          () =>
            pipe(
              rawToken,
              extractRawDataFromJwt,
              TE.fromEither,
              TE.mapLeft(err => fromErrToBadRequest(err, "Token not valid")),
              TE.map(_ => ({
                organizationFiscalCode,
                rawTokenUser: _
              }))
            )
        )
      )
    ),
    TE.chain(({ rawTokenUser, organizationFiscalCode }) =>
      pipe(
        rawTokenUser,
        TokenUser.decode,
        TE.fromEither,
        TE.mapLeft(() =>
          fromErrToBadRequest(
            new Error("Cannot upgrade Token because it is not an L1 Token")
          )
        ),
        TE.chain(tokenUser =>
          tokenUser.from_aa
            ? pipe(
                tokenUser.companies.find(
                  e => e.organization_fiscal_code === organizationFiscalCode
                ),
                O.fromNullable,
                O.foldW(
                  () => TE.left(res.status(404).json("Organization Not Found")),
                  _ => pipe(toTokenUserL2(tokenUser, _), TE.of)
                )
              )
            : TE.left(
                res
                  .status(500)
                  .json(
                    "Cannot upgrade a token not granted by an Authorization Authority"
                  )
              )
        )
      )
    ),
    TE.chain(tokenUserL2 =>
      pipe(
        getGenerateToken(config, redisClient)(tokenUserL2),
        TE.mapLeft(err =>
          res.status(500).json({
            detail: err.message,
            error: "Error generating L2 Token"
          })
        )
      )
    ),
    TE.map(_ => res.status(200).json({ token: _.tokenStr })),
    TE.toUnion
  )();
};
