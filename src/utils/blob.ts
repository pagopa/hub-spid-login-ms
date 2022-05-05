/**
 * Utility functions to interact with an Azure Storage.
 */
import * as azureStorage from "azure-storage";

import * as O from "fp-ts/lib/Option";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

export type StorageError = Error & {
  readonly code?: string;
};

// BLOB STORAGE FUNCTIONS AND TYPES

// Code used by blobService when a blob is not found

export const BlobNotFoundCode = "BlobNotFound";

/**
 * Create a new blob (media) from plain text.
 * Assumes that the container <containerName> already exists.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob storage container name
 * @param text            text to be saved
 */
export const upsertBlobFromText = (
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  text: string | Buffer,
  options: azureStorage.BlobService.CreateBlobRequestOptions = {}
): TE.TaskEither<Error, O.Option<azureStorage.BlobService.BlobResult>> =>
  TE.tryCatch(
    () =>
      new Promise<O.Option<azureStorage.BlobService.BlobResult>>(
        (resolve, reject) =>
          blobService.createBlockBlobFromText(
            containerName,
            blobName,
            text,
            options,
            (err, result, __) => {
              if (err) {
                return reject(err);
              } else {
                return resolve(O.fromNullable(result));
              }
            }
          )
      ),
    E.toError
  );

/**
 * Create a new blob (media) from a typed object.
 * Assumes that the container <containerName> already exists.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob storage container name
 * @param content         object to be serialized and saved
 */
export const upsertBlobFromObject = <T>(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  content: T,
  options: azureStorage.BlobService.CreateBlobRequestOptions = {}
): TE.TaskEither<Error, O.Option<azureStorage.BlobService.BlobResult>> =>
  pipe(
    TE.fromEither(E.tryCatch(() => JSON.stringify(content), E.toError)),
    TE.chain((rawJson) =>
      upsertBlobFromText(blobService, containerName, blobName, rawJson, options)
    )
  );
