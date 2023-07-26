import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  WithinRangeString
} from "@pagopa/ts-commons/lib/strings";
import { withDefault } from "@pagopa/ts-commons/lib/types";
import * as t from "io-ts";
import { SpidLevel } from "../utils/spid";

export const FISCAL_NUMBER_INTERNATIONAL_PREFIX = "TINIT-";

export const SpidUser = t.intersection([
  t.interface({
    // the following values may be set
    // by the calling application:
    // issuer -> Issuer
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

export const SpidUserWithLevel = t.intersection([
  SpidUser,
  t.type({
    authnContextClassRef: SpidLevel
  })
]);

export type SpidUserWithLevel = t.TypeOf<typeof SpidUserWithLevel>;

export const UserCompany = t.interface({
  email: EmailString,
  organization_fiscal_code: WithinRangeString(8, 16),
  organization_name: NonEmptyString
});
export type UserCompany = t.TypeOf<typeof UserCompany>;

export const UserCompanies = t.array(UserCompany);
export type UserCompanies = t.TypeOf<typeof UserCompanies>;

export const CommonTokenUser = t.intersection([
  t.interface({
    fiscal_number: FiscalCode,
    spid_level: SpidLevel
  }),
  t.partial({
    email: EmailString,
    family_name: NonEmptyString,
    id: NonEmptyString,
    mobile_phone: NonEmptyString,
    name: NonEmptyString
  })
]);

export type CommonTokenUser = t.TypeOf<typeof CommonTokenUser>;

export const TokenUser = t.intersection([
  t.union([
    t.intersection([
      CommonTokenUser,
      t.interface({
        companies: UserCompanies,
        from_aa: t.literal(true)
      })
    ]),
    t.intersection([
      CommonTokenUser,
      t.interface({
        from_aa: t.literal(false)
      })
    ])
  ]),
  t.interface({
    level: withDefault(t.literal("L1"), "L1")
  })
]);

export type TokenUser = t.TypeOf<typeof TokenUser>;

export const TokenUserL2 = t.intersection([
  CommonTokenUser,
  t.union([
    t.interface({ company: UserCompany, from_aa: t.literal(true) }),
    t.interface({ from_aa: t.literal(false) })
  ]),
  t.interface({
    level: withDefault(t.literal("L2"), "L2")
  })
]);

export type TokenUserL2 = t.TypeOf<typeof TokenUserL2>;
