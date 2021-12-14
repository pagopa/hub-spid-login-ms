import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorValidation,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorValidation
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";
import { TaskEither, taskEither } from "fp-ts/lib/TaskEither";
import { fromEither, fromLeft, tryCatch } from "fp-ts/lib/TaskEither";
import { User } from "../../generated/userregistry-api/User";
import { UserSeed } from "../../generated/userregistry-api/UserSeed";

import { UserRegistryAPIClient } from "../clients/userregistry_client";
import { errorsToError, toResponseErrorInternal } from "./conversions";
export const getUserId = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  externalId: FiscalCode,
  subscriptionKey: NonEmptyString
): TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  Option<{ id: string }>
> =>
  tryCatch(
    () =>
      apiClient.getUserByExternalId({
        SubscriptionKey: subscriptionKey,
        body: {
          externalId
        }
      }),
    toError
  )
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      toResponseErrorInternal
    )
    // Validation (Either) -> taskEither
    .chain(_ => {
      return fromEither(_).mapLeft(errs =>
        toResponseErrorInternal(errorsToError(errs))
      );
    })
    .chain(res => {
      switch (res.status) {
        case 200:
          return taskEither.of(some({ id: res.value.id }));
        case 404:
          return taskEither.of(none);
        default:
          return fromLeft(ResponseErrorForbiddenNotAuthorized);
      }
    });

export const postUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: UserSeed,
  subscriptionKey: NonEmptyString
): TaskEither<IResponseErrorInternal | IResponseErrorValidation, User> => {
  return tryCatch(() => {
    return apiClient.createUser({
      SubscriptionKey: subscriptionKey,
      body: {
        ...user
      }
    });
  }, toError)
    .mapLeft<IResponseErrorInternal | IResponseErrorValidation>(
      toResponseErrorInternal
    )
    .chain(_ =>
      fromEither(_).mapLeft(errs =>
        ResponseErrorValidation("Validation Error", errs.join("/"))
      )
    )
    .chain(res =>
      res.status === 201
        ? taskEither.of(res.value)
        : fromLeft(
            ResponseErrorValidation("Bad Input", "Error creating the user")
          )
    );
};
export const blurUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: UserSeed,
  fiscalCode: FiscalCode,
  subscriptionKey: NonEmptyString
): TaskEither<
  IResponseErrorInternal | IResponseErrorValidation,
  Option<Pick<User, "id">>
> => {
  return getUserId(apiClient, fiscalCode, subscriptionKey)
    .mapLeft<IResponseErrorInternal | IResponseErrorValidation>(error =>
      toResponseErrorInternal(toError(error))
    )
    .chain(maybeUserID =>
      maybeUserID.foldL(
        () =>
          postUser(apiClient, user, subscriptionKey).map(u =>
            some({ id: u.id })
          ),
        r => taskEither.of(some(r))
      )
    );
};
