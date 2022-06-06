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

// Extract the result type from the operation
type ApiResult = ReturnType<
  PersonalDatavaultAPIClient
// tslint:disable-next-line: no-any
>["saveUsingPATCH"] extends (a: any) => Promise<E.Either<any, infer R>>
  ? R
  : never;

type ErrorResponses =
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorValidation;

/**
 * Map results from PDV service into our specification
 *
 * @param res
 * @returns
 */
export const handleApiResult = (
  res: ApiResult
): TE.TaskEither<ErrorResponses, Pick<UserId, "id">> => {
  const status = res.status;
  switch (status) {
    case 200:
      return pipe(
        res.value,
        O.fromNullable,
        O.map((responseValue) => ({ id: responseValue.id })),
        TE.fromOption(() =>
          ResponseErrorInternal("Error reading response data")
        )
      );
    case 400:
      return TE.left(
        ResponseErrorValidation("Bad Input or Response", "Error internal")
      );
    case 403:
      return TE.left(ResponseErrorForbiddenNotAuthorized);
    case 409:
      return TE.left(ResponseErrorInternal("Error internal"));
    case 429:
      return TE.left(ResponseErrorInternal("Error calling PDV subsystem"));
    default: {
      // tslint:disable-next-line: no-dead-store
      const _: never = status;
      return TE.left(
        ResponseErrorInternal(
          `Unespected Response from PDV subsystem: '${status}'`
        )
      );
    }
  }
};

export const blurUser = (
  pdvClient: ReturnType<PersonalDatavaultAPIClient>,
  user: SaveUserDto,
  subscriptionKey: NonEmptyString
): TE.TaskEither<ErrorResponses, Pick<UserId, "id">> =>
  pipe(
    TE.tryCatch(
      () =>
        pdvClient.saveUsingPATCH({
          api_key: subscriptionKey,
          saveUserDto: user,
        }),
      // an unknown and unexpected error while making the request to PDV
      (error) => toResponseErrorInternal(toError(error))
    ),
    // response failed to be decoded
    // perhaps because the given specification isn't aligned with what's actually provided from PDV service
    TE.chainEitherKW(
      E.mapLeft(() =>
        ResponseErrorValidation("Bad Input", "Error creating the user")
      )
    ),
    // map result
    TE.chain(handleApiResult)
  );