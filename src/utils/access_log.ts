import { toEncryptedPayload } from "@pagopa/ts-commons/lib/encrypt";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { sequenceS } from "fp-ts/lib/Apply";
import { either } from "fp-ts/lib/Either";
import { curry } from "fp-ts/lib/function";
import { fromEither } from "fp-ts/lib/Option";
import { fromNullable, Option } from "fp-ts/lib/Option";
import { fromEither as fromEitherT, fromLeft } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { SpidBlobItem, SpidLogMsg } from "../types/access_log";
import { upsertBlobFromObject } from "./blob";

export const SAML_NAMESPACE = {
  ASSERTION: "urn:oasis:names:tc:SAML:2.0:assertion",
  PROTOCOL: "urn:oasis:names:tc:SAML:2.0:protocol"
};

export const getFiscalNumberFromPayload = (doc: Document): Option<FiscalCode> =>
  fromNullable(
    doc.getElementsByTagNameNS(SAML_NAMESPACE.ASSERTION, "Attribute")
  )
    .mapNullable(collection =>
      Array.from(collection).find(
        elem => elem.getAttribute("Name") === "fiscalNumber"
      )
    )
    .mapNullable(_ => _.textContent?.trim().replace("TINIT-", ""))
    .chain(_ => fromEither(FiscalCode.decode(_)));

export const getRequestIDFromPayload = (tagName: string, attrName: string) => (
  doc: Document
): Option<string> =>
  fromNullable(
    doc.getElementsByTagNameNS(SAML_NAMESPACE.PROTOCOL, tagName).item(0)
  ).chain(element =>
    fromEither(NonEmptyString.decode(element.getAttribute(attrName)))
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
) => {
  const encrypt = curry(toEncryptedPayload)(spidLogsPublicKey);
  return sequenceS(either)({
    encryptedRequestPayload: encrypt(spidLogMsg.requestPayload),
    encryptedResponsePayload: encrypt(spidLogMsg.responsePayload)
  })
    .map(item => ({
      ...spidLogMsg,
      ...item
    }))
    .fold(
      err =>
        fromLeft(
          new Error(`StoreSpidLogs|ERROR=Cannot encrypt payload|${err}`)
        ),
      (encryptedBlobItem: SpidBlobItem) =>
        fromEitherT(t.exact(SpidBlobItem).decode(encryptedBlobItem))
          .mapLeft(
            errs =>
              new Error(
                `StoreSpidLogs|ERROR=Cannot decode payload|ERROR_DETAILS=${readableReport(
                  errs
                )}`
              )
          )
          .chain(spidBlobItem =>
            upsertBlobFromObject(
              blobService,
              containerName,
              `${spidBlobItem.spidRequestId}-${spidLogMsg.createdAtDay}-${spidLogMsg.fiscalCode}.json`,
              spidBlobItem
            )
          )
    );
};
