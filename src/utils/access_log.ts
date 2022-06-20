import { toEncryptedPayload } from "@pagopa/ts-commons/lib/encrypt";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService, createBlobService } from "azure-storage";
import { sequenceS } from "fp-ts/lib/Apply";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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

/**
 * Format the name of the blob based on the Spid Message
 *
 * @param spidLogMsg
 * @returns
 */
export const makeSpidLogBlobName = (spidLogMsg: SpidLogMsg): string =>
  `${spidLogMsg.spidRequestId}-${spidLogMsg.createdAtDay}-${spidLogMsg.fiscalCode}.json`;

// Define a function that writes an encriptrd payload to a storage
export type AccessLogWriter = (
  encryptedBlobItem: SpidBlobItem,
  blobName: string
) => TE.TaskEither<Error, O.Option<BlobService.BlobResult>>;

// Define a function that encrypts a spid log message
export type AccessLogEncrypter = (
  spidLogMsg: SpidLogMsg
) => E.Either<Error, SpidBlobItem>;

// Supported storage for spid access log
export type AccessLogStorageKind = "azurestorage";

// Create an encrypted from a given public key
export const createAccessLogEncrypter = (
  spidLogsPublicKey: NonEmptyString
): AccessLogEncrypter => (
  spidLogMsg: SpidLogMsg
): E.Either<Error, SpidBlobItem> => {
  const encrypt = curry(toEncryptedPayload)(spidLogsPublicKey);
  return pipe(
    sequenceS(E.Applicative)({
      encryptedRequestPayload: encrypt(spidLogMsg.requestPayload),
      encryptedResponsePayload: encrypt(spidLogMsg.responsePayload)
    }),
    E.map(item => ({
      ...spidLogMsg,
      ...item
    }))
  );
};

// Create a writer for azure storage
export const createAzureStorageAccessLogWriter = (
  blobService: BlobService,
  containerName: string
): AccessLogWriter => (
  encryptedBlobItem: SpidBlobItem,
  blobName: string
): ReturnType<AccessLogWriter> =>
  upsertBlobFromObject(blobService, containerName, blobName, encryptedBlobItem);

// Create a writer for a given kind
export const createAccessLogWriter = (
  storageKind: AccessLogStorageKind,
  connectionString: string,
  containerName: string
): AccessLogWriter => {
  if (storageKind === "azurestorage") {
    return createAzureStorageAccessLogWriter(
      createBlobService(connectionString),
      containerName
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _: never = storageKind;
    throw new Error(`Unsupported storage kind: ${storageKind}`);
  }
};
