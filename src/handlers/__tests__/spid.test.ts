import {
  successHandler,
  errorHandler,
  metadataRefreshHandler,
  accessLogHandler,
} from "../spid";
import mockReq from "../../__mocks__/request";
import mockRes from "../../__mocks__/response";
import { BlobService } from "azure-storage";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  aSAMLRequest,
  aSAMLResponse,
  aSAMLResponseWithoutRequestId,
  aSAMLResponseWithoutFiscalCode,
} from "../../__mocks__/spid";
import * as T from "fp-ts/lib/Task";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

// Mock an express request and response
const aMockedRequest = mockReq();
const aMockedResponse = mockRes();

import { AccessLogEncrypter, AccessLogWriter } from "../../utils/access_log";

// Mock logger to spy error
import { logger } from "../../utils/logger";
import { SpidBlobItem } from "../../types/access_log";
const spiedLoggerError = jest.spyOn(logger, "error");

const mockAccessLogWriter = jest.fn<
  ReturnType<AccessLogWriter>,
  Parameters<AccessLogWriter>
>((_, __) => TE.right(void 0));

const mockAccessLogEncrypter = jest.fn<
  ReturnType<AccessLogEncrypter>,
  Parameters<AccessLogEncrypter>
>(() => E.right({} as SpidBlobItem));

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
  const mockIdpMetadataRefresher: () => T.Task<void> = jest.fn(() => async () =>
    void 0
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
    accessLogHandler(mockAccessLogWriter, mockAccessLogEncrypter)(
      "0.0.0.0",
      aSAMLRequest,
      aSAMLResponse
    );

    // await fire&forget storeSpidLogs
    await flushPromises();

    expect(mockAccessLogWriter).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).not.toHaveBeenCalled();
  });

  it("should fail calling storeSpidLogs function if returns left", async () => {
    mockAccessLogWriter.mockImplementationOnce(() =>
      TE.left(new Error("any error"))
    );

    const result = accessLogHandler(
      mockAccessLogWriter,
      mockAccessLogEncrypter
    )("0.0.0.0", aSAMLRequest, aSAMLResponse);

    // await fire&forget storeSpidLogs
    await flushPromises();

    console.log("-->", result);

    expect(mockAccessLogWriter).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
  });

  it("should fail if not able to parse response", async () => {
    // undefined value is needed to test error case but
    // we have to cast to avoid type check at compile time
    const anEmptyResponsePayload = (undefined as unknown) as string;

    accessLogHandler(mockAccessLogWriter, mockAccessLogEncrypter)(
      "0.0.0.0",
      aSAMLRequest,
      anEmptyResponsePayload
    );

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot parse SPID XML"
    );
    expect(mockAccessLogWriter).not.toHaveBeenCalled();
  });

  it("should fail if not able to get original request id from response", async () => {
    accessLogHandler(mockAccessLogWriter, mockAccessLogEncrypter)(
      "0.0.0.0",
      aSAMLRequest,
      aSAMLResponseWithoutRequestId
    );

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot get Request ID from SPID XML"
    );
    expect(mockAccessLogWriter).not.toHaveBeenCalled();
  });

  it("should fail if not able to get user fiscal code from response", async () => {
    accessLogHandler(mockAccessLogWriter, mockAccessLogEncrypter)(
      "0.0.0.0",
      aSAMLRequest,
      aSAMLResponseWithoutFiscalCode
    );

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot get user's fiscal Code from SPID XML"
    );
    expect(mockAccessLogWriter).not.toHaveBeenCalled();
  });
});
