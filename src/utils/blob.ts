/**
 * Utility functions to interact with an Azure Storage.
 */
import * as azureStorage from "azure-storage";

import { toError, tryCatch2v } from "fp-ts/lib/Either";
import { fromNullable, Option } from "fp-ts/lib/Option";

import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";

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
): TaskEither<Error, Option<azureStorage.BlobService.BlobResult>> =>
  tryCatch(
    () =>
      new Promise<Option<azureStorage.BlobService.BlobResult>>(
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
                return resolve(fromNullable(result));
              }
            }
          )
      ),
    toError
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
): TaskEither<Error, Option<azureStorage.BlobService.BlobResult>> =>
  fromEither(
    tryCatch2v(() => JSON.stringify(content), toError)
  ).chain(rawJson =>
    upsertBlobFromText(blobService, containerName, blobName, rawJson, options)
  );
