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
import { SaveUserDto } from "../../generated/pdv-userregistry-api/SaveUserDto";
import { UserId } from "../../generated/pdv-userregistry-api/UserId";

import { UserRegistryAPIClient } from "../clients/userregistry_client";
import { PersonalDatavaultAPIClient } from "../clients/pdv_client";
import { errorsToError, toResponseErrorInternal } from "./conversions";
import { logger } from "./logger";

/*
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
      err => {
        console.log(`0: USER REGISTRY getUserByExternalId: ${err.message}`);
        return toResponseErrorInternal(err);
      }
    )
    // Validation (Either) -> taskEither
    .chain(_ =>
      fromEither(_).mapLeft(errs => {
        return toResponseErrorInternal(errorsToError(errs));
      })
    )
    .chain(res => {
      console.log("4" + res);
      switch (res.status) {
        case 200:
          return taskEither.of(some({ id: res.value.id }));
        case 404:
          return taskEither.of(none);
        case 401:
          return fromLeft(ResponseErrorForbiddenNotAuthorized);
        default:
          return fromLeft(ResponseErrorForbiddenNotAuthorized);
      }
    });

export const postUser = (
         apiClient: ReturnType<UserRegistryAPIClient>,
         user: user.SaveUserDto,
         subscriptionKey: NonEmptyString
       ): TaskEither<
         | IResponseErrorInternal
         | IResponseErrorValidation
         | IResponseErrorForbiddenNotAuthorized,
         User
       > => {
         return tryCatch(
           () => {
             return apiClient.createUser({
               SubscriptionKey: subscriptionKey,
               body: {
                 ...user,
               },
             });
           },
           (err) => {
             return toError(err);
           }
         )
           .mapLeft<
             | IResponseErrorInternal
             | IResponseErrorValidation
             | IResponseErrorForbiddenNotAuthorized
           >((err) => {
             return toResponseErrorInternal(err);
           })
           .chain((_) =>
             fromEither(_).mapLeft((errs) => {
               return ResponseErrorValidation(
                 "Validation Error",
                 errs.join("/")
               );
             })
           )
           .chain((res) => {
             switch (res.status) {
               case 201:
                 return taskEither.of(res.value);
               case 401:
                 return fromLeft(ResponseErrorForbiddenNotAuthorized);
               default:
                 return fromLeft(
                   ResponseErrorValidation(
                     "Bad Input",
                     "Error creating the user"
                   )
                 );
             }
           });
       };

       */

export const blurUser = (
         apiClient: ReturnType<UserRegistryAPIClient>,
         pdvClinet: ReturnType<PersonalDatavaultAPIClient>,
         user: SaveUserDto,
         fiscalCode: FiscalCode,
         subscriptionKey: NonEmptyString
       ): TaskEither<
         | IResponseErrorInternal
         | IResponseErrorValidation
         | IResponseErrorForbiddenNotAuthorized,
         Option<Pick<UserId, "id">>
       > => {

              pdvClinet.saveUsingPATCH() 
         return getUserId(apiClient, fiscalCode, subscriptionKey)
           .mapLeft<
             | IResponseErrorInternal
             | IResponseErrorValidation
             | IResponseErrorForbiddenNotAuthorized
           >((error) => toResponseErrorInternal(toError(error)))
           .chain((maybeUserID) =>
             maybeUserID.foldL(
               () =>
                 postUser(apiClient, user, subscriptionKey).map((u) =>
                   some({ id: u.id })
                 ),
               (r) => taskEither.of(some(r))
             )
           );
       };
