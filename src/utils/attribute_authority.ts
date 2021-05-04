import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  ResponseErrorForbiddenNotAuthorized
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { fromEither, fromPredicate } from "fp-ts/lib/TaskEither";

import { UserCompanies } from "../types/user";
import { errorsToError, toResponseErrorInternal } from "./conversions";
import { fetchFromApi } from "./fetch";

export const getUserCompanies = (
  apiEndpoint: NonEmptyString,
  method: string,
  userFiscalCode: FiscalCode
) => {
  const req = {
    body: JSON.stringify({ fiscalCode: userFiscalCode }),
    method
  };
  return fetchFromApi(apiEndpoint, req)
    .chain(response =>
      fromEither(UserCompanies.decode(response.body).mapLeft(errorsToError))
    )
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      toResponseErrorInternal
    )
    .chain(
      fromPredicate(
        _ => _.length > 0,
        () => ResponseErrorForbiddenNotAuthorized
      )
    );
};
