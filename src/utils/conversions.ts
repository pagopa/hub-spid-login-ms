import { ResponseErrorInternal } from "@pagopa/ts-commons/lib/responses";
import { Either } from "fp-ts/lib/Either";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import {
  CommonTokenUser,
  FISCAL_NUMBER_INTERNATIONAL_PREFIX,
  SpidUser,
  TokenUser,
  TokenUserL2,
  UserCompany
} from "../types/user";

export function errorsToError(errors: Errors): Error {
  return new Error(errorsToReadableMessages(errors).join(" / "));
}

export const toCommonTokenUser = (
  from: SpidUser
): Either<Error, CommonTokenUser> => {
  const normalizedUser = {
    ...from,
    fiscalNumber: from.fiscalNumber.replace(
      FISCAL_NUMBER_INTERNATIONAL_PREFIX,
      ""
    )
  };
  return CommonTokenUser.decode({
    email: normalizedUser.email,
    family_name: normalizedUser.familyName,
    fiscal_number: normalizedUser.fiscalNumber,
    mobile_phone: normalizedUser.mobilePhone,
    name: normalizedUser.name
  }).mapLeft(errorsToError);
};

export const toTokenUserL2 = (
  from: TokenUser,
  company: UserCompany
): Either<Error, TokenUserL2> => {
  return TokenUserL2.decode({
    company,
    email: from.email,
    family_name: from.family_name,
    fiscal_number: from.fiscal_number,
    from_aa: from.from_aa,
    mobile_phone: from.mobile_phone,
    name: from.name
  }).mapLeft(errorsToError);
};

export const toResponseErrorInternal = (err: Error) =>
  ResponseErrorInternal(err.message);
