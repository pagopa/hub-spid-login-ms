import * as crypto from "crypto";
import {
  successHandler,
  errorHandler,
  metadataRefreshHandler,
  accessLogHandler,
  acs
} from "../spid";
import mockReq from "../../__mocks__/request";
import {
  aSAMLRequest,
  aSAMLResponse,
  aSAMLResponseWithoutRequestId,
  aSAMLResponseWithoutFiscalCode,
  aFiscalCode
} from "../../__mocks__/spid";
import * as T from "fp-ts/lib/Task";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import {
  AccessLogEncrypter,
  AccessLogWriter,
  MakeSpidLogBlobName
} from "../../utils/access_log";
import { logger } from "../../utils/logger";
import { SpidBlobItem } from "../../types/access_log";
import { pipe } from "fp-ts/lib/function";
import { IConfig } from "../../utils/config";
import mockRes from "../../__mocks__/response";

// Mock logger to spy error
const spiedLoggerError = jest.spyOn(logger, "error");
// Mock an express request and response
const aMockedRequest = mockReq();
const aMockedResponse = mockRes();

const mockAccessLogWriter = jest.fn<
  ReturnType<AccessLogWriter>,
  Parameters<AccessLogWriter>
>((_, __) => TE.right(void 0));

const mockAccessLogEncrypter = jest.fn<
  ReturnType<AccessLogEncrypter>,
  Parameters<AccessLogEncrypter>
>(() => E.right({} as SpidBlobItem));

const mockMakeSpidLogBlobName = jest.fn<
  ReturnType<MakeSpidLogBlobName>,
  Parameters<MakeSpidLogBlobName>
>(() => "blobname.json");

const mockGetAssertion = jest.fn().mockReturnValue(aSAMLResponse);

const aValidAcsPayload = {
  fiscalNumber: aFiscalCode,
  getAssertionXml: mockGetAssertion
};

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
      token: aSpidToken
    });
  });
});

describe("errorHandler", () => {
  it("should fail with error", async () => {
    errorHandler(aMockedRequest, aMockedResponse);

    expect(aMockedResponse.json).toHaveBeenCalledTimes(1);
    expect(aMockedResponse.json).toHaveBeenCalledWith({
      error: "error"
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
      metadataUpdate: "completed"
    });
  });
});

describe("accessLogHandler", () => {
  it("should succeed calling storeSpidLogs function if it returns right", async () => {
    accessLogHandler(
      mockAccessLogWriter,
      mockAccessLogEncrypter,
      mockMakeSpidLogBlobName
    )("0.0.0.0", aSAMLRequest, aSAMLResponse);

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
      mockAccessLogEncrypter,
      mockMakeSpidLogBlobName
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

    accessLogHandler(
      mockAccessLogWriter,
      mockAccessLogEncrypter,
      mockMakeSpidLogBlobName
    )("0.0.0.0", aSAMLRequest, anEmptyResponsePayload);

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot parse SPID XML"
    );
    expect(mockAccessLogWriter).not.toHaveBeenCalled();
  });

  it("should fail if not able to get original request id from response", async () => {
    accessLogHandler(
      mockAccessLogWriter,
      mockAccessLogEncrypter,
      mockMakeSpidLogBlobName
    )("0.0.0.0", aSAMLRequest, aSAMLResponseWithoutRequestId);

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot get Request ID from SPID XML"
    );
    expect(mockAccessLogWriter).not.toHaveBeenCalled();
  });

  it("should fail if not able to get user fiscal code from response", async () => {
    accessLogHandler(
      mockAccessLogWriter,
      mockAccessLogEncrypter,
      mockMakeSpidLogBlobName
    )("0.0.0.0", aSAMLRequest, aSAMLResponseWithoutFiscalCode);

    expect(spiedLoggerError).toHaveBeenCalledTimes(1);
    expect(spiedLoggerError).toHaveBeenCalledWith(
      "SpidLogCallback|ERROR=Cannot get user's fiscal Code from SPID XML"
    );
    expect(mockAccessLogWriter).not.toHaveBeenCalled();
  });
});

describe("acs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should redirect correctly with a valid payload", async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      }
    });
    const config = pipe(({
      ...process.env,
      ENABLE_JWT: true,
      ENABLE_USER_REGISTRY: false,
      ENABLE_SPID_ACCESS_LOGS: false,
      ENABLE_ADE_AA: false,
      REDIS_TLS_ENABLED: false,
      JWT_TOKEN_ISSUER: "SPID",
      JWT_TOKEN_AUDIENCE: "https://localhost",
      JWT_TOKEN_PRIVATE_KEY: privateKey,
      JWT_TOKEN_KID: "key-id-for-your-jwt-key"
    } as unknown) as IConfig);
    const response = await acs(config)(aValidAcsPayload);
    response.apply(aMockedResponse);

    expect(response.kind).toEqual("IResponsePermanentRedirect");
    expect(aMockedResponse.redirect).toHaveBeenCalledWith(
      301,
      expect.stringContaining("/success#token=")
    );
  });
});
