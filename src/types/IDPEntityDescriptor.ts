import * as t from "io-ts";
// eslint-disable-next-line import/no-internal-modules
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { nonEmptyArray } from "io-ts-types";

export const IDPEntityDescriptor = t.interface({
  cert: nonEmptyArray(NonEmptyString),

  entityID: t.string,

  entryPoint: t.string,

  logoutUrl: t.string
});

export type IDPEntityDescriptor = t.TypeOf<typeof IDPEntityDescriptor>;
