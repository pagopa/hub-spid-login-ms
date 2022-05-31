import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorValidation,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorValidation
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

import * as TE from "fp-ts/lib/TaskEither";
import { none, Option, some } from "fp-ts/lib/Option";
import { User } from "../../generated/userregistry-api/User";
import { UserSeed } from "../../generated/userregistry-api/UserSeed";

import { UserRegistryAPIClient } from "../clients/userregistry_client";
import { errorsToError, toResponseErrorInternal } from "./conversions";
import { logger } from "./logger";
export const getUserId = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  externalId: FiscalCode,
  subscriptionKey: NonEmptyString
): TE.TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  Option<{ readonly id: string }>
> =>
  pipe(
    TE.tryCatch(
      () =>
        apiClient.getUserByExternalId({
          SubscriptionKey: subscriptionKey,
          body: {
            externalId
          }
        }),
      toError
    ),
    TE.mapLeft(err => {
      logger.error(`USER REGISTRY getUserByExternalId: ${err.message}`);
      return toResponseErrorInternal(err);
    }),
    // Validation (Either) -> taskEither
    TE.chain(_ =>
      pipe(
        _,
        E.mapLeft(errs => toResponseErrorInternal(errorsToError(errs))),
        TE.fromEither
      )
    ),
    TE.chainW(res => {
      switch (res.status) {
        case 200:
          return TE.of(some({ id: res.value.id }));
        case 404:
          return TE.of(none);
        default:
          return TE.left(ResponseErrorForbiddenNotAuthorized);
      }
    })
  );

export const postUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: UserSeed,
  subscriptionKey: NonEmptyString
): TE.TaskEither<IResponseErrorInternal | IResponseErrorValidation, User> =>
  pipe(
    TE.tryCatch(
      () =>
        apiClient.createUser({
          SubscriptionKey: subscriptionKey,
          body: {
            ...user
          }
        }),
      toError
    ),
    TE.mapLeft(err => {
      logger.error(`USER REGISTRY postUser: ${err.message}`);
      return toResponseErrorInternal(err);
    }),
    TE.chainW(_ =>
      pipe(
        _,
        E.mapLeft(errs =>
          ResponseErrorValidation("Validation Error", errs.join("/"))
        ),
        TE.fromEither
      )
    ),
    TE.chain(res =>
      res.status === 201
        ? TE.of(res.value)
        : TE.left(
            ResponseErrorValidation("Bad Input", "Error creating the user")
          )
    )
  );
export const blurUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: UserSeed,
  fiscalCode: FiscalCode,
  subscriptionKey: NonEmptyString
): TE.TaskEither<
  IResponseErrorInternal | IResponseErrorValidation,
  Option<Pick<User, "id">>
> =>
  pipe(
    getUserId(apiClient, fiscalCode, subscriptionKey),
    TE.mapLeft(error => toResponseErrorInternal(toError(error))),
    TE.chain(maybeUserID =>
      pipe(
        maybeUserID,
        O.fold(
          () =>
            pipe(
              postUser(apiClient, user, subscriptionKey),
              TE.map(u => some({ id: u.id }))
            ),
          r => TE.of(some(r))
        )
      )
    )
  );
