import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorValidation,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorValidation,
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { Option, some } from "fp-ts/lib/Option";
import { SaveUserDto } from "../../generated/pdv-userregistry-api/SaveUserDto";
import { UserId } from "../../generated/pdv-userregistry-api/UserId";
import { pipe } from "fp-ts/lib/function";

import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { PersonalDatavaultAPIClient } from "../clients/pdv_client";
import { toResponseErrorInternal } from "./conversions";

type ErrorResponses =
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorValidation;

export const blurUser = (
  pdvClient: ReturnType<PersonalDatavaultAPIClient>,
  user: SaveUserDto,
  subscriptionKey: NonEmptyString
): TE.TaskEither<ErrorResponses, Option<Pick<UserId, "id">>> =>
  pipe(
    TE.tryCatch(
      () =>
        pdvClient.saveUsingPATCH({
          api_key: subscriptionKey,
          saveUserDto: user,
        }),
      toError
    ),
    TE.mapLeft((error) => toResponseErrorInternal(toError(error))),
    TE.chainEitherKW(
      E.mapLeft(() =>
        ResponseErrorValidation("Bad Input", "Error creating the user")
      )
    ),
    TE.chainW((res) => {
      const status = res.status;
      const value = res.value;
      switch (status) {
        case 200:
          return pipe(
            value,
            O.fromNullable,
            O.map(responeValue => some({ id: responeValue.id })),
            O.fold(()=>TE.left<ErrorResponses>(ResponseErrorInternal("Error reading response data")), (data) => TE.of(data))
          );
        case 400:
          return TE.left<ErrorResponses>(
            ResponseErrorValidation("Bad Input or Response", "Error internal")
          );
        case 403:
          return TE.left<ErrorResponses>(ResponseErrorForbiddenNotAuthorized);
        case 409:
          return TE.left<ErrorResponses>(
            ResponseErrorInternal("Error internal")
          );
        case 429:
          return TE.left<ErrorResponses>(
            ResponseErrorInternal("Error calling PDV subsystem")
          );
        default: {
          // tslint:disable-next-line: no-dead-store
          const _: never = status;
          return TE.left<ErrorResponses>(
            ResponseErrorInternal(
              `Unespected Response from PDV subsystem: '${status}'`
            )
          );
        }
      }
    })
  );
