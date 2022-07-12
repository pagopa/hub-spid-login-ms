import { toEncryptedPayload } from "@pagopa/ts-commons/lib/encrypt";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService, createBlobService } from "azure-storage";
import { sequenceS } from "fp-ts/lib/Apply";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SpidBlobItem, SpidLogMsg } from "../types/access_log";
import { upsertBlobFromObject } from "./blob";
import { SpidLogsStorageConfiguration } from "./config";

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
) => TE.TaskEither<Error, void>;

// Define a function that encrypts a spid log message
export type AccessLogEncrypter = (
  spidLogMsg: SpidLogMsg
) => E.Either<Error, SpidBlobItem>;

// Supported storage for spid access log
export type AccessLogStorageKind = SpidLogsStorageConfiguration["SPID_LOGS_STORAGE_KIND"];

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
  pipe(
    upsertBlobFromObject(
      blobService,
      containerName,
      blobName,
      encryptedBlobItem
    ),
    TE.map(_ => void 0)
  );

// Create a writer for AWS S3
export const createAwsS3AccessLogWriter = (
  s3Service: S3Client,
  bucketName: string
): AccessLogWriter => (
  encryptedBlobItem: SpidBlobItem,
  blobName: string
): ReturnType<AccessLogWriter> =>
  pipe(
    TE.tryCatch(
      async () =>
        await s3Service.send(
          new PutObjectCommand({
            Body: JSON.stringify(encryptedBlobItem),
            Bucket: bucketName,
            Key: blobName
          })
        ),
      E.toError
    ),
    TE.map(_ => void 0)
  );
// Create a writer for a given kind
export const createAccessLogWriter = (
  storageConfig: SpidLogsStorageConfiguration
): AccessLogWriter => {
  if (storageConfig.SPID_LOGS_STORAGE_KIND === "azurestorage") {
    return createAzureStorageAccessLogWriter(
      createBlobService(storageConfig.SPID_LOGS_STORAGE_CONNECTION_STRING),
      storageConfig.SPID_LOGS_STORAGE_CONTAINER_NAME
    );
  } else if (storageConfig.SPID_LOGS_STORAGE_KIND === "awss3") {
    return createAwsS3AccessLogWriter(
      new S3Client({
        endpoint: {
          hostname: storageConfig.SPID_LOGS_STORAGE_CONTAINER_HOST,
          path: "/",
          port: +storageConfig.SPID_LOGS_STORAGE_CONTAINER_PORT,
          protocol: storageConfig.SPID_LOGS_STORAGE_CONTAINER_PROTOCOL
        },
        forcePathStyle: true,
        region: storageConfig.SPID_LOGS_STORAGE_CONTAINER_REGION
      }),
      storageConfig.SPID_LOGS_STORAGE_CONTAINER_NAME
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _: never = storageConfig;
    throw new Error(
      `Unsupported storage kind: ${
        (storageConfig as any).SPID_LOGS_STORAGE_KIND // eslint-disable-line @typescript-eslint/no-explicit-any
      }`
    );
  }
};
