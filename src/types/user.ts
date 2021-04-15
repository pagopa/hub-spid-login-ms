import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";

export const SpidUser = t.intersection([
  t.interface({
    // the following values may be set
    // by the calling application:
    // authnContextClassRef: SpidLevel,
    // issuer: Issuer
    fiscalNumber: FiscalCode,
    getAssertionXml: t.Function
  }),
  t.partial({
    email: EmailString,
    familyName: t.string,
    mobilePhone: NonEmptyString,
    name: t.string,
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
    family_name: t.string,
    mobile_phone: NonEmptyString,
    name: t.string
  })
]);

export type TokenUser = t.TypeOf<typeof TokenUser>;
