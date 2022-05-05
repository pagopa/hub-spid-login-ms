import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { upsertBlobFromObject, upsertBlobFromText } from "../blob";

import * as E from "fp-ts/lib/Either";

const mockedCallback = jest.fn(
  (_, __, ___, ____, cb: (err, result, _____) => void) =>
    cb(undefined, ({} as unknown) as BlobService.BlobResult, undefined)
);
const mockedBlobService = ({
  createBlockBlobFromText: mockedCallback,
} as unknown) as BlobService;
const mockedContainerName = "aContainer" as NonEmptyString;
const mockedBlobName = "aBlobName" as NonEmptyString;
const aText = "any text to save to blob";
const anObject = { key: "value" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("upsertBlobFromText", () => {
  it("Should return right when createBlockBlobFromText calls the callback with a result that resolves the promise", async () => {
    const result = await upsertBlobFromText(
      mockedBlobService,
      mockedContainerName,
      mockedBlobName,
      aText
    )();

    expect(mockedCallback).toBeCalledTimes(1);
    expect(E.isRight(result)).toBe(true);
  });

  it("Should return left when createBlockBlobFromText calls the callback with an error that rejects the promise", async () => {
    mockedCallback.mockImplementationOnce(
      (_, __, ___, ____, cb: (err, result, _____) => void) =>
        cb("an error", undefined, undefined)
    );

    const result = await upsertBlobFromText(
      mockedBlobService,
      mockedContainerName,
      mockedBlobName,
      aText
    )();

    expect(mockedCallback).toBeCalledTimes(1);
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toEqual("an error");
    }
  });
});

describe("upsertBlobFromObject", () => {
  it("Should return right when createBlockBlobFromText calls the callback with a result that resolves the promise", async () => {
    const result = await upsertBlobFromObject(
      mockedBlobService,
      mockedContainerName,
      mockedBlobName,
      anObject
    )();

    expect(mockedCallback).toBeCalledTimes(1);
    expect(E.isRight(result)).toBe(true);
  });

  it("Should return left when createBlockBlobFromText calls the callback with an error that rejects the promise", async () => {
    mockedCallback.mockImplementationOnce(
      (_, __, ___, ____, cb: (err, result, _____) => void) =>
        cb("an error", undefined, undefined)
    );

    const result = await upsertBlobFromObject(
      mockedBlobService,
      mockedContainerName,
      mockedBlobName,
      anObject
    )();

    expect(mockedCallback).toBeCalledTimes(1);
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toEqual("an error");
    }
  });
});
