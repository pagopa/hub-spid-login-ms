import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  ResponseErrorForbiddenNotAuthorized
} from "@pagopa/ts-commons/lib/responses";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { fromEither, fromPredicate } from "fp-ts/lib/TaskEither";

import * as t from "io-ts";
import { UserCompanies, UserCompany } from "../types/user";
import { errorsToError, toResponseErrorInternal } from "./conversions";
import { fetchFromApi } from "./fetch";

const ApiUserCompanies = t.array(
  t.interface({
    fiscalCode: OrganizationFiscalCode,
    organizationName: NonEmptyString,
    pec: EmailString
  })
);
type ApiUserCompanies = t.TypeOf<typeof ApiUserCompanies>;

export const getUserCompanies = (
  apiEndpoint: NonEmptyString,
  method: string,
  userFiscalCode: FiscalCode
) => {
  const req = {
    body: JSON.stringify({ fiscalCode: userFiscalCode }),
    headers: { "Content-Type": "application/json" },
    method
  };
  return fetchFromApi(apiEndpoint, req)
    .mapLeft<IResponseErrorInternal | IResponseErrorForbiddenNotAuthorized>(
      toResponseErrorInternal
    )
    .chain(
      fromPredicate(
        res => res.statusCode === 200,
        () => ResponseErrorForbiddenNotAuthorized
      )
    )
    .chain(response =>
      fromEither(
        ApiUserCompanies.decode(response.body).mapLeft(errs =>
          toResponseErrorInternal(errorsToError(errs))
        )
      )
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
