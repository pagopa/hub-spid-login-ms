import {
  successHandler,
  errorHandler,
  metadataRefreshHandler,
  accessLogHandler,
} from "../spid";
import mockReq from "../../__mocks__/request";
import mockRes from "../../__mocks__/response";
import { task, Task } from "fp-ts/lib/Task";
import { BlobService } from "azure-storage";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  aSAMLRequest,
  aSAMLResponse,
  aSAMLResponseWithoutRequestId,
  aSAMLResponseWithoutFiscalCode,
} from "../../__mocks__/spid";
import { left, right } from "fp-ts/lib/TaskEither";
import { some } from "fp-ts/lib/Option";
import { toError } from "fp-ts/lib/Either";

// Mock an express request and response
const aMockedRequest = mockReq();
const aMockedResponse = mockRes();

// Mock access_log module to spy on storeSpidLogs function
jest.mock("../../utils/access_log", () => ({
  __esModule: true,
  ...jest.requireActual("../../utils/access_log"),
}));
import * as accessLogUtility from "../../utils/access_log";
const spiedStoreSpidLogs = jest.spyOn(accessLogUtility, "storeSpidLogs");

// Mock logger to spy error
jest.mock("../../utils/logger", () => ({
  __esModule: true,
  ...jest.requireActual("../../utils/logger"),
}));
import { logger } from "../../utils/logger";
const spiedLoggerError = jest.spyOn(logger, "error");

// Utility functions that allows us to wait for fire&forget task to be awaited
const flushPromises = () => new Promise(setImmediate);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("successHandler", () => {
  it("should succeed with the sent token", async () => {
    const aSpidToken = "a_spid_token";
    aMockedRequest.query.token = aSpidToken;

    successHandler(aMockedRequest, aMockedResponse);

    expect(aMockedResponse.json).toHaveBeenCalledTimes(1);
    expect(aMockedResponse.json).toHaveBeenCalledWith({
      success: "success",
      token: aSpidToken,
    });
  });
});

describe("errorHandler", () => {
  it("should fail with error", async () => {
    errorHandler(aMockedRequest, aMockedResponse);

    expect(aMockedResponse.json).toHaveBeenCalledTimes(1);
    expect(aMockedResponse.json).toHaveBeenCalledWith({
      error: "error",
    });
  });
});

describe("metadataRefreshHandler", () => {
  const mockIdpMetadataRefresher: () => Task<void> = jest.fn(() =>
    task.of(void 0)
  );
  it("should succeed when metadata update is completed", async () => {
    await metadataRefreshHandler(mockIdpMetadataRefresher)(
      aMockedRequest,
      aMockedResponse
    );

    expect(aMockedResponse.json).toHaveBeenCalledTimes(1);
    expect(aMockedResponse.json).toHaveBeenCalledWith({
      metadataUpdate: "completed",
    });
  });
});

describe("accessLogHandler", () => {
  it("should succeed calling storeSpidLogs function if it returns right", async () => {
    spiedStoreSpidLogs.mockReturnValue(
      right(task.of(some({} as BlobService.BlobResult)))
    );

    accessLogHandler(
      ({} as unknown) as BlobService,
      "a_container" as NonEmptyString,
      "aPublicKey" as NonEmptyString
    )("0.0.0.0", aSAMLRequest, aSAMLResponse);

    // await fire&forget storeSpidLogs
    await flushPromises();

    expect(spiedStoreSpidLogs).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).not.toHaveBeenCalled();
  });

  it("should fail calling storeSpidLogs function if returns left", async () => {
    spiedStoreSpidLogs.mockReturnValue(left(task.of(toError("any error"))));

    accessLogHandler(
      ({} as unknown) as BlobService,
      "a_container" as NonEmptyString,
      "aPublicKey" as NonEmptyString
    )("0.0.0.0", aSAMLRequest, aSAMLResponse);

    // await fire&forget storeSpidLogs
    await flushPromises();

    expect(spiedStoreSpidLogs).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
  });

  it("should fail if not able to parse response", async () => {
    accessLogHandler(
      ({} as unknown) as BlobService,
      "a_container" as NonEmptyString,
      "aPublicKey" as NonEmptyString
    )("0.0.0.0", aSAMLRequest, undefined);

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot parse SPID XML"
    );
    expect(spiedStoreSpidLogs).not.toHaveBeenCalled();
  });

  it("should fail if not able to get original request id from response", async () => {
    accessLogHandler(
      ({} as unknown) as BlobService,
      "a_container" as NonEmptyString,
      "aPublicKey" as NonEmptyString
    )("0.0.0.0", aSAMLRequest, aSAMLResponseWithoutRequestId);

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot get Request ID from SPID XML"
    );
    expect(spiedStoreSpidLogs).not.toHaveBeenCalled();
  });

  it("should fail if not able to get user fiscal code from response", async () => {
    accessLogHandler(
      ({} as unknown) as BlobService,
      "a_container" as NonEmptyString,
      "aPublicKey" as NonEmptyString
    )("0.0.0.0", aSAMLRequest, aSAMLResponseWithoutFiscalCode);

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot get user's fiscal Code from SPID XML"
    );
    expect(spiedStoreSpidLogs).not.toHaveBeenCalled();
  });
});
