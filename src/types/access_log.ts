import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { EncryptedPayload } from "@pagopa/ts-commons/lib/encrypt";
import {
  FiscalCode,
  IPString,
  PatternString
} from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";

/**
 * Payload of the stored blob item
 * (one for each SPID request or response).
 */
export const SpidBlobItem = t.interface({
  // Timestamp of Request/Response creation
  createdAt: UTCISODateFromString,

  // IP of the client that made a SPID login action
  ip: IPString,

  // XML payload of the SPID Request
  encryptedRequestPayload: EncryptedPayload,

  // XML payload of the SPID Response
  encryptedResponsePayload: EncryptedPayload,

  // SPID request ID
  spidRequestId: t.string
});

export type SpidBlobItem = t.TypeOf<typeof SpidBlobItem>;

export const SpidLogMsg = t.interface({
  // Timestamp of Request/Response creation
  createdAt: UTCISODateFromString,

  // Date of the SPID request / response in YYYY-MM-DD format
  createdAtDay: PatternString("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),

  // Fiscal code of the authenticating user
  fiscalCode: t.union([t.undefined, FiscalCode]),

  // IP of the client that made a SPID login action
  ip: IPString,

  // XML payload of the SPID Request
  requestPayload: t.string,

  // XML payload of the SPID Response
  responsePayload: t.string,

  // SPID request id
  spidRequestId: t.union([t.undefined, t.string])
});

export type SpidLogMsg = t.TypeOf<typeof SpidLogMsg>;
