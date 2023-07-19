import { SAML_NAMESPACE } from "@pagopa/io-spid-commons/dist/utils/saml";
import { enumType } from "@pagopa/ts-commons/lib/types";
import { flow } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";

export enum SpidLevelEnum {
  "https://www.spid.gov.it/SpidL1" = "https://www.spid.gov.it/SpidL1",

  "https://www.spid.gov.it/SpidL2" = "https://www.spid.gov.it/SpidL2",

  "https://www.spid.gov.it/SpidL3" = "https://www.spid.gov.it/SpidL3"
}

/**
 * A SPID level.
 */
export type SpidLevel = t.TypeOf<typeof SpidLevel>;
export const SpidLevel = enumType<SpidLevelEnum>(SpidLevelEnum, "SpidLevel");

export const getSpidLevelFromSAMLResponse: (
  doc: Document
) => O.Option<SpidLevelEnum> = flow(
  doc =>
    doc
      .getElementsByTagNameNS(SAML_NAMESPACE.ASSERTION, "AuthnContext")
      .item(0),
  O.fromNullable,
  O.chainNullableK(element => element.textContent?.trim()),
  O.chain(value => O.fromEither(SpidLevel.decode(value)))
);
