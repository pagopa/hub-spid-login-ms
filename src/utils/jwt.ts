import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";

import * as TE from "fp-ts/lib/TaskEither";
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

type ExpireJWT = t.TypeOf<typeof ExpireJWT>;

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
  issuer: NonEmptyString,
  keyid?: NonEmptyString,
  audience?: NonEmptyString,
  requestId?: NonEmptyString
  // eslint-disable-next-line max-params
): TE.TaskEither<Error, string> =>
  pipe(
    TE.taskify<Error, string>(cb =>
      jwt.sign(
        tokenUser,
        privateKey,
        withoutUndefinedValues({
          algorithm: "RS256",
          audience,
          expiresIn: `${tokenTtlSeconds} seconds`,
          issuer,
          jwtid: requestId ?? ulid(),
          keyid,
          subject: tokenUser.id
        }),
        cb
      )
    )(),
    TE.mapLeft(E.toError)
  );

export const extractRawDataFromJwt = (
  jwtToken: NonEmptyString
): E.Either<Error, jwt.JwtPayload | null> =>
  E.tryCatch(() => jwt.decode(jwtToken, { json: true }), E.toError);

export const extractTypeFromJwt = <S, A>(
  jwtToken: NonEmptyString,
  typeToExtract: t.Type<A, S>
): TE.TaskEither<Error, A> =>
  pipe(
    jwtToken,
    extractRawDataFromJwt,
    flow(typeToExtract.decode, E.mapLeft(errorsToError)),
    TE.fromEither
  );

export const extractJwtRemainingValidTime = (
  jwtToken: string
): TE.TaskEither<Error, ExpireJWT> =>
  pipe(
    jwtToken,
    jwt.decode,
    ExpireJWT.decode,
    E.mapLeft(err => new Error(errorsToReadableMessages(err).join("|"))),
    TE.fromEither
  );

export const verifyToken = (
  publicCert: NonEmptyString,
  token: string,
  issuer: NonEmptyString
): TE.TaskEither<Error, jwt.JwtPayload | string> =>
  pipe(
    TE.taskify<Error, jwt.JwtPayload | string>(cb =>
      jwt.verify(token, publicCert, { algorithms: ["RS256"], issuer }, cb)
    )(),
    TE.mapLeft(E.toError)
  );
