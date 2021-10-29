import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseErrorValidation
} from "@pagopa/ts-commons/lib/responses";
import { EmailString, FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { Option, none, some, isSome } from "fp-ts/lib/Option";
import { taskEither } from "fp-ts/lib/TaskEither";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { use } from "passport";
import { CertificationEnum } from "../../generated/userregistry-api/CertificationEnum";
import { User } from "../../generated/userregistry-api/User";

import { UserRegistryAPIClient } from "../clients/userregistry_client";
import { CommonTokenUser, SpidUser } from "../types/user";
import { errorsToError, toBadRequest, toResponseErrorInternal } from "./conversions";
import * as t from 'io-ts';

export const getUserId = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  externalId: FiscalCode
) => {
  return tryCatch(
    () => apiClient.getUserIdByExternalId({ externalId }),
    toError
  )
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      toResponseErrorInternal
    )
    // Validation (Either) -> taskEither
    .chain(_ => fromEither(_).mapLeft(errs => toResponseErrorInternal(errorsToError(errs)))
    )
    .chain<Option<{id: string}>>(res => {
        switch(res.status) {
          case 200: return taskEither.of(some(res.value))
          case 404: return taskEither.of(none)
          default: return fromLeft(ResponseErrorForbiddenNotAuthorized)
        }
      }
    )
};

export const postUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: User
) => {
  return tryCatch(
    () => apiClient.createUser({ body : {
      ...user
     }
    }),
    toError
  )
    .mapLeft<IResponseErrorInternal | IResponseErrorValidation>(
      toResponseErrorInternal
    )
    .chain(_ =>
      fromEither(_).mapLeft(errs => toResponseErrorInternal(errorsToError(errs))
      )
    )
    .chain<User>(res =>
      res.status === 201
        ? taskEither.of(res.value)
        : fromLeft(ResponseErrorValidation("Bad Input", res.value.detail))
    )
};


// const SpidCertificationUser = t.intersection([User, t.interface({
//   certification: CertificationEnum
// }), ])
// type SpidCertificationUser = t.TypeOf<typeof SpidCertificationUser>;

export const blurUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: User,
  fiscalCode: FiscalCode
  // {
  //   fiscalCode: FiscalCode,
  //   firstName: NonEmptyString,
  //   lastName: NonEmptyString,
  //   email: EmailString,
  //   certification: CertificationEnum,
  //   birthDate?: string,
  // }
) => {
  return getUserId(apiClient, fiscalCode)
    .mapLeft(error => {
      return toResponseErrorInternal(toError(error))
    })
    .chain((maybeUserID) => {
      // return fromPredicate(isSome, () => {
      //   return postUser(apiClient, user)
      //   .mapLeft((err) =>
      //     toResponseErrorInternal(toError(err))
      //   ).map(
      //     user => user
      //   )
      // })(maybeUserID).fold<IResponseErrorInternal | Option<{id: string}>>(
      //     err => err,
      //     u => taskEither.of(u)
      //   )
      return maybeUserID.isSome() ?
      taskEither.of(maybeUserID.value)
      : postUser(apiClient, user)
        .mapLeft(err => toResponseErrorInternal(toError(err)))
        .map(u => {
          return {id: u.id}
        })
    })

    // .chain(maybeUserID =>
    //     maybeUserID.isSome()
    //       ? fromEither(fromOption(ResponseErrorInternal | ResponseErrorForbiddenNotAuthorized)(maybeUserID))
    //       : postUser(apiClient, user)
    //             .mapLeft(toError)
    //             .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(toResponseErrorInternal)
    //             .map(user => user.id)
    //   );
    // .chain(maybeUserID =>
    //   fromPredicate(
    //     maybeUserID.isSome(),
    //     () => postUser(apiClient, user)
    //     .mapLeft(
    //       toError
    //     )
    //     .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
    //       toResponseErrorInternal
    //     )
    //     .map(user => user.id)

    //   )(maybeUserID.)
    // )
    // .chain(
    //   fromPredicate(
    //     _ => _.length > 0,
    //     () => ResponseErrorForbiddenNotAuthorized
    //   )
    // )
    // .chain<{id: string}>(res =>
    //   res.status === 200
    //     ? taskEither.of(res.value)
    //     : fromLeft(ResponseErrorForbiddenNotAuthorized)
    // )
};