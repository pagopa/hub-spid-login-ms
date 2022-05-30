import { ResponseErrorForbiddenNotAuthorized } from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";

import { AdeAPIClient } from "../clients/ade";
import { UserCompanies, UserCompany } from "../types/user";
import { errorsToError, toResponseErrorInternal } from "./conversions";

export const getUserCompanies = (
  apiClient: ReturnType<AdeAPIClient>,
  userFiscalCode: FiscalCode
) =>
  pipe(
    TE.tryCatch(
      () =>
        apiClient.getUserCompanies({
          body: { fiscalCode: userFiscalCode },
        }),
      E.toError
    ),
    TE.mapLeft((err) => toResponseErrorInternal(err)),

    TE.chain((_) =>
      pipe(
        TE.fromEither(_),
        TE.mapLeft((errs) => toResponseErrorInternal(errorsToError(errs)))
      )
    ),

    TE.chainW((res) =>
      res.status !== 200
        ? TE.left(ResponseErrorForbiddenNotAuthorized)
        : TE.of(res.value)
    ),

    TE.chain((arr) => {
      return arr.length > 0
        ? TE.of(arr)
        : TE.left(ResponseErrorForbiddenNotAuthorized);
    }),

    TE.map((d) =>
      pipe(
        UserCompanies.encode(
          d.map((company) =>
            pipe(
              UserCompany.encode({
                email: company.pec,
                organization_fiscal_code: company.fiscalCode,
                organization_name: company.organizationName,
              })
            )
          )
        )
      )
    )
  );
