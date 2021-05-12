import { ResponseErrorInternal } from "@pagopa/ts-commons/lib/responses";
import express = require("express");
import { Either } from "fp-ts/lib/Either";
import { fromEither } from "fp-ts/lib/TaskEither";
import { Errors } from "io-ts";
import * as t from "io-ts";
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

export const toBadRequest = (res: express.Response) => (
  errs: Error | Errors,
  message: string = ""
) =>
  res.status(400).json({
    detail: errs instanceof Error ? errs.message : errorsToError(errs).message,
    error: "Bad Request",
    message
  });

export const mapDecoding = <S, A>(type: t.Type<A, S>, toDecode: unknown) =>
  fromEither(type.decode(toDecode)).mapLeft(errorsToError);
