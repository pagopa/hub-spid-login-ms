import { Errors } from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { SpidUser, TokenUser } from "../types/user";

export function errorsToError(errors: Errors): Error {
  return new Error(errorsToReadableMessages(errors).join(" / "));
}

export const toTokenUser = (from: SpidUser): TokenUser => ({
  email: from.email,
  family_name: from.familyName,
  fiscal_number: from.fiscalNumber,
  mobile_phone: from.mobilePhone,
  name: from.name
});
