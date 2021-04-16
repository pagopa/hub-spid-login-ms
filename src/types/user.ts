import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";

export const FISCAL_NUMBER_INTERNATIONAL_PREFIX = "TINIT-";

export const SpidUser = t.intersection([
  t.interface({
    // the following values may be set
    // by the calling application:
    // authnContextClassRef: SpidLevel,
    // issuer: Issuer
    fiscalNumber: NonEmptyString,
    getAssertionXml: t.Function
  }),
  t.partial({
    email: EmailString,
    familyName: NonEmptyString,
    mobilePhone: NonEmptyString,
    name: NonEmptyString,
    nameID: t.string,
    nameIDFormat: t.string,
    sessionIndex: t.string
  })
]);

export type SpidUser = t.TypeOf<typeof SpidUser>;

export const TokenUser = t.intersection([
  t.interface({
    fiscal_number: FiscalCode
  }),
  t.partial({
    email: EmailString,
    family_name: NonEmptyString,
    mobile_phone: NonEmptyString,
    name: NonEmptyString
  })
]);

export type TokenUser = t.TypeOf<typeof TokenUser>;
