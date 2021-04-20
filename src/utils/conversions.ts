import { Either } from "fp-ts/lib/Either";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import {
  FISCAL_NUMBER_INTERNATIONAL_PREFIX,
  SpidUser,
  TokenUser
} from "../types/user";

export function errorsToError(errors: Errors): Error {
  return new Error(errorsToReadableMessages(errors).join(" / "));
}

export const toTokenUser = (from: SpidUser): Either<Error, TokenUser> => {
  const normalizedUser = {
    ...from,
    fiscalNumber: from.fiscalNumber.replace(
      FISCAL_NUMBER_INTERNATIONAL_PREFIX,
      ""
    )
  };
  return TokenUser.decode({
    email: normalizedUser.email,
    family_name: normalizedUser.familyName,
    fiscal_number: normalizedUser.fiscalNumber,
    mobile_phone: normalizedUser.mobilePhone,
    name: normalizedUser.name
  }).mapLeft(errorsToError);
};
