import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { tryCatch2v } from "fp-ts/lib/Either";
import { toError } from "fp-ts/lib/Either";
import { fromEither, TaskEither, taskify } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import * as jwt from "jsonwebtoken";
import { ulid } from "ulid";
import { TokenUser, TokenUserL2 } from "../types/user";
import { errorsToError } from "./conversions";

const ExpireJWT = t.exact(
  t.interface({
    exp: t.number
  })
);

/**
 * Generates a new token containing the logged spid User.
 *
 * @param privateKey: The RSA's private key used to sign this JWT token
 * @param fiscalCode: The logged Spid User
 * @param tokenTtl: Token Time To live (expressed in seconds)
 * @param issuer: The Token issuer
 */
export const getUserJwt = (
  privateKey: NonEmptyString,
  tokenUser: TokenUser | TokenUserL2,
  tokenTtlSeconds: NonNegativeInteger,
  issuer: NonEmptyString
): TaskEither<Error, string> =>
  taskify<Error, string>(cb =>
    jwt.sign(
      tokenUser,
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: `${tokenTtlSeconds} seconds`,
        issuer,
        jwtid: ulid()
      },
      cb
    )
  )().mapLeft(toError);

export const extractTypeFromJwt = <S, A>(
  jwtToken: NonEmptyString,
  typeToExtract: t.Type<A, S>
) =>
  fromEither(typeToExtract.decode(jwt.decode(jwtToken))).mapLeft(errorsToError);

export const extractRawDataFromJwt = (jwtToken: NonEmptyString) =>
  tryCatch2v(() => jwt.decode(jwtToken, { json: true }), toError);

export const extractJwtRemainingValidTime = (jwtToken: string) =>
  fromEither(
    ExpireJWT.decode(jwt.decode(jwtToken)).mapLeft(
      err => new Error(errorsToReadableMessages(err).join("|"))
    )
  )
    // Calculate remaining token validity
    .map(_ => _.exp - Math.floor(new Date().valueOf() / 1000));

export const verifyToken = (
  publicCert: NonEmptyString,
  token: string,
  issuer: NonEmptyString
) =>
  taskify<Error, object>(cb =>
    jwt.verify(token, publicCert, { algorithms: ["RS256"], issuer }, cb)
  )().mapLeft(toError);
