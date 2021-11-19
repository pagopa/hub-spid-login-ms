import {
  aSAMLRequest,
  aSAMLResponse,
  aSAMLResponseWithoutRequestId,
  aSAMLResponseWithoutFiscalCode,
} from "../../__mocks__/spid";
import { DOMParser } from "xmldom";
import {
  getFiscalNumberFromPayload,
  getRequestIDFromPayload,
  getRequestIDFromRequest,
  getRequestIDFromResponse,
  storeSpidLogs,
} from "../access_log";
import { BlobService } from "azure-storage";
import {
  FiscalCode,
  IPString,
  NonEmptyString,
} from "@pagopa/ts-commons/lib/strings";
import { SpidLogMsg } from "../../types/access_log";
import { left, right, toError } from "fp-ts/lib/Either";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { Option, some } from "fp-ts/lib/Option";

// Mock encrypt module to spy on toEncryptedPayload function
jest.mock("@pagopa/ts-commons/lib/encrypt", () => ({
  __esModule: true,
  ...jest.requireActual("@pagopa/ts-commons/lib/encrypt"),
  toEncryptedPayload: jest.fn((_, __) =>
    right(({
      cypherText: "encoded",
      iv: "iv",
      encryptedKey: "ek",
    } as unknown) as encrypt.EncryptedPayload)
  ),
}));
import * as encrypt from "@pagopa/ts-commons/lib/encrypt";
const spiedToEncryptedPayload = jest.spyOn(encrypt, "toEncryptedPayload");

// Mock access_log module to spy on storeSpidLogs function
import * as blob from "../blob";
const spiedUpsertBlobFromObject = jest.spyOn(blob, "upsertBlobFromObject");
spiedUpsertBlobFromObject.mockImplementation((_, __, ___, ____) =>
  taskEither.of<Error, Option<BlobService.BlobResult>>(
    some(({} as unknown) as BlobService.BlobResult)
  )
);

const requestXMLDocument = new DOMParser().parseFromString(
  aSAMLRequest,
  "text/xml"
);

const responseXMLDocument = new DOMParser().parseFromString(
  aSAMLResponse,
  "text/xml"
);

const responseWithoutFiscalCodeXMLDocument = new DOMParser().parseFromString(
  aSAMLResponseWithoutFiscalCode,
  "text/xml"
);

const responseWithoutRequestIdXMLDocument = new DOMParser().parseFromString(
  aSAMLResponseWithoutRequestId,
  "text/xml"
);

describe("getFiscalNumberFromPayload", () => {
  it("Should return an option containing a fiscal number from saml response when present", async () => {
    const maybeFiscalNumber = getFiscalNumberFromPayload(responseXMLDocument);
    expect(maybeFiscalNumber.isSome()).toBe(true);
  });

  it("Should return an empty option when fiscal code is not present in saml payload", async () => {
    const maybeFiscalNumber = getFiscalNumberFromPayload(
      responseWithoutFiscalCodeXMLDocument
    );
    expect(maybeFiscalNumber.isNone()).toBe(true);
  });
});

describe("getRequestIDFromPayload", () => {
  it("Should return an option containing a request id from saml payload when present", async () => {
    const maybeRequestId = getRequestIDFromPayload(
      "Response",
      "InResponseTo"
    )(responseXMLDocument);
    expect(maybeRequestId.isSome()).toBe(true);
  });

  it("Should return an empty option when request id is not present in saml payload", async () => {
    const maybeRequestId = getRequestIDFromPayload(
      "Response",
      "InResponseTo"
    )(responseWithoutRequestIdXMLDocument);
    expect(maybeRequestId.isNone()).toBe(true);
  });
});

describe("getRequestIDFromRequest", () => {
  it("Should return an option containing a request id from saml request", async () => {
    const maybeRequestId = getRequestIDFromRequest(requestXMLDocument);
    expect(maybeRequestId.isSome()).toBe(true);
  });
});

describe("getRequestIDFromResponse", () => {
  it("Should return an option containing a request id from saml response when present", async () => {
    const maybeRequestId = getRequestIDFromResponse(responseXMLDocument);
    expect(maybeRequestId.isSome()).toBe(true);
  });

  it("Should return an empty option when request id is not present in saml response", async () => {
    const maybeRequestId = getRequestIDFromResponse(
      responseWithoutRequestIdXMLDocument
    );
    expect(maybeRequestId.isNone()).toBe(true);
  });
});

describe("storeSpidLogs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockedBlobService = ({} as unknown) as BlobService;
  const mockedContainerName = "aContainer" as NonEmptyString;
  const mockedPublicKey = "aPublicKey" as NonEmptyString;
  const mockedSpidLogMessage = {
    createdAt: new Date(),
    createdAtDay: "2021-11-01",
    fiscalCode: "AAAAAA00A00A000A" as FiscalCode,
    ip: "0.0.0.0" as IPString,
    requestPayload: "a request payload",
    responsePayload: "a response payload",
    spidRequestId: "a spi request id",
  } as SpidLogMsg;

  it("Should return right when spid log message is correctly saved", async () => {
    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    ).run();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).toBeCalledTimes(1);
    expect(result.isRight()).toBe(true);
  });

  it("Should return left when encrypt fails", async () => {
    spiedToEncryptedPayload.mockImplementationOnce((_, __) =>
      left(toError("any error"))
    );

    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    ).run();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).not.toBeCalled();
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) {
      expect(result.value.message).toEqual(
        "StoreSpidLogs|ERROR=Cannot encrypt payload|Error: any error"
      );
    }
  });

  it("Should return left when SpidBlobItem decoding fails", async () => {
    spiedToEncryptedPayload.mockImplementationOnce((_, __) =>
      // this will cause decoding to fail because cypherText is missing
      right(({
        iv: "iv",
        encryptedKey: "ek",
      } as unknown) as encrypt.EncryptedPayload)
    );

    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    ).run();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).not.toBeCalled();
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) {
      expect(result.value.message).toEqual(
        "StoreSpidLogs|ERROR=Cannot decode payload|ERROR_DETAILS=value [undefined] at [root.encryptedRequestPayload.cypherText] is not a valid [string]"
      );
    }
  });

  it("Should return left when UpsertBlobFromObject fails", async () => {
    spiedUpsertBlobFromObject.mockImplementationOnce(() =>
      fromLeft<Error, Option<BlobService.BlobResult>>(toError("any error"))
    );

    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    ).run();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).toBeCalledTimes(1);
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) {
      expect(result.value.message).toEqual("any error");
    }
  });
});
