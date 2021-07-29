/**
 * Utility functions to interact with an Azure Storage.
 */
import * as azureStorage from "azure-storage";
import * as t from "io-ts";

import { Either, left, parseJSON, right, toError } from "fp-ts/lib/Either";
import { fromNullable, none, Option, some } from "fp-ts/lib/Option";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  fromEither,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";

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
  upsertBlobFromText(
    blobService,
    containerName,
    blobName,
    JSON.stringify(content),
    options
  );

/**
 * Get a blob content as text (string).
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob file name
 */
export const getBlobAsText = (
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  options: azureStorage.BlobService.GetBlobRequestOptions = {}
): TaskEither<Error, Option<string>> =>
  tryCatch(
    () =>
      new Promise<Either<Error, Option<string>>>(resolve => {
        blobService.getBlobToText(
          containerName,
          blobName,
          options,
          (err, result, __) => {
            if (err) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const errorAsStorageError = err as StorageError;
              if (
                errorAsStorageError.code !== undefined &&
                errorAsStorageError.code === BlobNotFoundCode
              ) {
                return resolve(right<Error, Option<string>>(none));
              }
              return resolve(left<Error, Option<string>>(err));
            } else {
              return resolve(
                right<Error, Option<string>>(fromNullable(result))
              );
            }
          }
        );
      }),
    toError
  ).chain(fromEither);

/**
 * Get a blob content as a typed (io-ts) object.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob file name
 */
export const getBlobAsObject = <A, S>(
  type: t.Type<A, S>,
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  options: azureStorage.BlobService.GetBlobRequestOptions = {}
): TaskEither<Error, Option<A>> =>
  getBlobAsText(blobService, containerName, blobName, options).chain(
    maybeText =>
      maybeText.foldL(
        () => taskEither.of(none),
        text =>
          fromEither(parseJSON(text, toError)).chain(json =>
            fromEither(type.decode(json)).bimap(
              errs => new Error(readableReport(errs)),
              some
            )
          )
      )
  );
