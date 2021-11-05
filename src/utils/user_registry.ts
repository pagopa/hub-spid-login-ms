import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorValidation,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorValidation
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";
import { TaskEither, taskEither } from "fp-ts/lib/TaskEither";
import { fromEither, fromLeft, tryCatch } from "fp-ts/lib/TaskEither";
import { User } from "../../generated/userregistry-api/User";

import { UserRegistryAPIClient } from "../clients/userregistry_client";
import { errorsToError, toResponseErrorInternal } from "./conversions";

export const getUserId = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  externalId: FiscalCode
): TaskEither<
  IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized,
  Option<{ id: string }>
> =>
  tryCatch(() => apiClient.getUserIdByExternalId({ externalId }), toError)
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      toResponseErrorInternal
    )
    // Validation (Either) -> taskEither
    .chain(_ =>
      fromEither(_).mapLeft(errs =>
        toResponseErrorInternal(errorsToError(errs))
      )
    )
    .chain(res => {
      switch (res.status) {
        case 200:
          return taskEither.of(some(res.value));
        case 404:
          return taskEither.of(none);
        default:
          return fromLeft(ResponseErrorForbiddenNotAuthorized);
      }
    });

export const postUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: User
): TaskEither<IResponseErrorInternal | IResponseErrorValidation, User> => {
  return tryCatch(
    () =>
      apiClient.createUser({
        body: {
          ...user
        }
      }),
    toError
  )
    .mapLeft<IResponseErrorInternal | IResponseErrorValidation>(
      toResponseErrorInternal
    )
    .chain(_ =>
      fromEither(_).mapLeft(errs =>
        toResponseErrorInternal(errorsToError(errs))
      )
    )
    .chain(res =>
      res.status === 201
        ? taskEither.of(res.value)
        : fromLeft(ResponseErrorValidation("Bad Input", res.value.detail))
    );
};

export const blurUser = (
  apiClient: ReturnType<UserRegistryAPIClient>,
  user: User,
  fiscalCode: FiscalCode
): TaskEither<IResponseErrorInternal, Pick<User, "id">> => {
  return getUserId(apiClient, fiscalCode)
    .mapLeft(error => {
      return toResponseErrorInternal(toError(error));
    })
    .chain(maybeUserID => {
      return maybeUserID.isSome()
        ? taskEither.of(maybeUserID.toUndefined())
        : postUser(apiClient, user)
            .mapLeft(err => toResponseErrorInternal(toError(err)))
            .map(u => {
              return { id: u.id };
            });
    });
};
