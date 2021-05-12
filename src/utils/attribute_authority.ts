import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  ResponseErrorForbiddenNotAuthorized
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { taskEither } from "fp-ts/lib/TaskEither";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { Companies } from "../../generated/ade-api/Companies";

import { AdeAPIClient } from "../clients/ade";
import { UserCompanies, UserCompany } from "../types/user";
import { errorsToError, toResponseErrorInternal } from "./conversions";

export const getUserCompanies = (
  apiClient: ReturnType<AdeAPIClient>,
  userFiscalCode: FiscalCode
) => {
  return tryCatch(
    () => apiClient.getUserCompanies({ body: { fiscalCode: userFiscalCode } }),
    toError
  )
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      toResponseErrorInternal
    )
    .chain(_ =>
      fromEither(_).mapLeft(errs =>
        toResponseErrorInternal(errorsToError(errs))
      )
    )
    .chain<Companies>(res =>
      res.status === 200
        ? taskEither.of(res.value)
        : fromLeft(ResponseErrorForbiddenNotAuthorized)
    )

    .chain(
      fromPredicate(
        _ => _.length > 0,
        () => ResponseErrorForbiddenNotAuthorized
      )
    )
    .map(_ =>
      UserCompanies.encode(
        _.map(company =>
          UserCompany.encode({
            email: company.pec,
            organization_fiscal_code: company.fiscalCode,
            organization_name: company.organizationName
          })
        )
      )
    );
};
