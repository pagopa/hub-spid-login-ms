import * as express from "express";
import { parseJSON } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  taskEither
} from "fp-ts/lib/TaskEither";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as crypto from "crypto";
import { fromNullable } from "fp-ts/lib/Option";
import { SESSION_INVALIDATE_TOKEN_PREFIX, SESSION_TOKEN_PREFIX } from "../app";
import { UpgradeTokenBody } from "../types/request";
import { TokenUser, TokenUserL2 } from "../types/user";
import { getConfigOrThrow } from "../utils/config";
import { mapDecoding, toBadRequest, toTokenUserL2 } from "../utils/conversions";
import {
  extractJwtRemainingValidTime,
  extractRawDataFromJwt,
  getUserJwt
} from "../utils/jwt";
import { REDIS_CLIENT } from "../utils/redis";
import {
  deleteTask,
  existsKeyTask,
  getTask,
  setWithExpirationTask
} from "../utils/redis_storage";

const config = getConfigOrThrow();

const redisClient = REDIS_CLIENT;
const getRawTokenUserFromRedis = (token: string, res: express.Response) =>
  getTask(redisClient, `${SESSION_TOKEN_PREFIX}${token}`)
    .mapLeft(() => res.status(500).json("Error while retrieving token"))
    .chain(maybeToken =>
      maybeToken.foldL(
        () => fromLeft(res.status(404).json("Token not found")),
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

export const getTokenExpiration = (tokenUser: TokenUser | TokenUserL2) =>
  config.ENABLE_ADE_AA === true
    ? TokenUser.is(tokenUser)
      ? config.L1_TOKEN_EXPIRATION
      : config.L2_TOKEN_EXPIRATION
    : config.TOKEN_EXPIRATION;

export const generateToken = (tokenUser: TokenUser | TokenUserL2) =>
  taskEither
    .of<Error, NonNegativeInteger>(getTokenExpiration(tokenUser))
    .chain(tokenExpiration =>
      config.ENABLE_JWT
        ? getUserJwt(
            config.JWT_TOKEN_PRIVATE_KEY,
            tokenUser,
            tokenExpiration,
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
                tokenExpiration
              ).bimap(
                () => new Error("Error storing Opaque Token"),
                () => ({
                  tokenStr: _,
                  tokenUser
                })
              )
            )
    );

export const introspectHandler = async (
  req: express.Request,
  res: express.Response // first check if token is blacklisted
) =>
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

export const invalidateHandler = async (
  req: express.Request,
  res: express.Response // first check if token is blacklisted
) =>
  await taskEither
    .of(config.ENABLE_JWT)
    .chain(jwtEnabled =>
      jwtEnabled
        ? extractJwtRemainingValidTime(req.body.token).chain(remainingExpTime =>
            setWithExpirationTask(
              redisClient,
              `${SESSION_INVALIDATE_TOKEN_PREFIX}${req.body.token}`,
              "true",
              remainingExpTime
            )
          )
        : deleteTask(redisClient, `${SESSION_TOKEN_PREFIX}${req.body.token}`)
    )
    .fold(
      () => res.status(500).json("Error while invalidating Token"),
      _ => res.status(200).json(_)
    )
    .run();

export const upgradeTokenHandler = (tokenHeaderName: NonEmptyString) => async (
  req: express.Request,
  res: express.Response
) => {
  const fromErrToBadRequest = toBadRequest(res);
  await fromEither(
    UpgradeTokenBody.decode(req.body).mapLeft(fromErrToBadRequest)
  )
    .chain(_ =>
      fromEither(NonEmptyString.decode(req.headers[tokenHeaderName])).bimap(
        e =>
          fromErrToBadRequest(e, `Missing required header ${tokenHeaderName}`),
        header => ({
          jwtEnabled: config.ENABLE_JWT,
          organizationFiscalCode: _.organization_fiscal_code,
          rawToken: header
        })
      )
    )
    .chain(({ jwtEnabled, organizationFiscalCode, rawToken }) =>
      jwtEnabled
        ? fromEither(extractRawDataFromJwt(rawToken)).bimap(
            err => fromErrToBadRequest(err, "Token not valid"),
            _ => ({
              organizationFiscalCode,
              rawTokenUser: _
            })
          )
        : getRawTokenUserFromRedis(req.body.token, res).map(_ => ({
            organizationFiscalCode,
            rawTokenUser: _
          }))
    )
    .chain(({ rawTokenUser, organizationFiscalCode }) =>
      fromEither(
        TokenUser.decode(rawTokenUser).mapLeft(() =>
          fromErrToBadRequest(
            new Error("Cannot upgrade Token because it is not an L1 Token")
          )
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
};
