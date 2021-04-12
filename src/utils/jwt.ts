import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { TaskEither, taskify } from "fp-ts/lib/TaskEither";
import * as jwt from "jsonwebtoken";
import { ulid } from "ulid";
import { SpidUser } from "../spid/spid";

/**
 * Generates a new token containing the logged spid User.
 *
 * @param privateKey: The RSA's private key used to sign this JWT token
 * @param fiscalCode: The logged Spid User
 * @param tokenTtl: Token Time To live (expressed in seconds)
 * @param issuer: The Token issuer
 */
export const getSpidUserJwt = (
  privateKey: NonEmptyString,
  spidUser: SpidUser,
  tokenTtl: NonNegativeInteger,
  issuer: NonEmptyString
): TaskEither<Error, string> =>
  taskify<Error, string>(cb =>
    jwt.sign(
      spidUser,
      privateKey,
      {
        algorithm: "ES256",
        expiresIn: `${tokenTtl} seconds`,
        issuer,
        jwtid: ulid()
      },
      cb
    )
  )().mapLeft(toError);
