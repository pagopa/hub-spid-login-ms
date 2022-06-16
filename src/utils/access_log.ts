import { toEncryptedPayload } from "@pagopa/ts-commons/lib/encrypt";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { sequenceS } from "fp-ts/lib/Apply";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { SpidBlobItem, SpidLogMsg } from "../types/access_log";
import { upsertBlobFromObject } from "./blob";

const curry = <I, II extends ReadonlyArray<unknown>, R>(
  fn: (a: I, ...aa: II) => R
) => (a: I) => (...aa: II): R => fn(a, ...aa);

export const SAML_NAMESPACE = {
  ASSERTION: "urn:oasis:names:tc:SAML:2.0:assertion",
  PROTOCOL: "urn:oasis:names:tc:SAML:2.0:protocol"
};

export const getFiscalNumberFromPayload = (
  doc: Document
): O.Option<FiscalCode> =>
  pipe(
    O.fromNullable(
      doc.getElementsByTagNameNS(SAML_NAMESPACE.ASSERTION, "Attribute")
    ),
    O.mapNullable(collection =>
      Array.from(collection).find(
        elem => elem.getAttribute("Name") === "fiscalNumber"
      )
    ),
    O.mapNullable(_ => _.textContent?.trim().replace("TINIT-", "")),
    O.chain(_ => O.fromEither(FiscalCode.decode(_)))
  );

export const getRequestIDFromPayload = (tagName: string, attrName: string) => (
  doc: Document
): O.Option<string> =>
  pipe(
    O.fromNullable(
      doc.getElementsByTagNameNS(SAML_NAMESPACE.PROTOCOL, tagName).item(0)
    ),
    O.chain(element =>
      O.fromEither(NonEmptyString.decode(element.getAttribute(attrName)))
    )
  );

export const getRequestIDFromRequest = getRequestIDFromPayload(
  "AuthnRequest",
  "ID"
);

export const getRequestIDFromResponse = getRequestIDFromPayload(
  "Response",
  "InResponseTo"
);

export const storeSpidLogs = (
  blobService: BlobService,
  containerName: NonEmptyString,
  spidLogsPublicKey: NonEmptyString,
  spidLogMsg: SpidLogMsg
): TE.TaskEither<Error, O.Option<BlobService.BlobResult>> => {
  const encrypt = curry(toEncryptedPayload)(spidLogsPublicKey);
  return pipe(
    sequenceS(E.Applicative)({
      encryptedRequestPayload: encrypt(spidLogMsg.requestPayload),
      encryptedResponsePayload: encrypt(spidLogMsg.responsePayload)
    }),
    E.map(item => ({
      ...spidLogMsg,
      ...item
    })),
    E.fold(
      err =>
        TE.left(new Error(`StoreSpidLogs|ERROR=Cannot encrypt payload|${err}`)),
      (encryptedBlobItem: SpidBlobItem) =>
        pipe(
          encryptedBlobItem,
          t.exact(SpidBlobItem).decode,
          TE.fromEither,
          TE.mapLeft(
            errs =>
              new Error(
                `StoreSpidLogs|ERROR=Cannot decode payload|ERROR_DETAILS=${readableReport(
                  errs
                )}`
              )
          ),
          TE.chain(spidBlobItem =>
            upsertBlobFromObject(
              blobService,
              containerName,
              `${spidBlobItem.spidRequestId}-${spidLogMsg.createdAtDay}-${spidLogMsg.fiscalCode}.json`,
              spidBlobItem
            )
          )
        )
    )
  );
};
