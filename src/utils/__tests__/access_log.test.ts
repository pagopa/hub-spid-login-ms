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
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

// Mock encrypt module to spy on toEncryptedPayload function
jest.mock("@pagopa/ts-commons/lib/encrypt", () => ({
  __esModule: true,
  ...jest.requireActual("@pagopa/ts-commons/lib/encrypt"),
  toEncryptedPayload: jest.fn((_, __) =>
    E.right(({
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
  TE.of<Error, O.Option<BlobService.BlobResult>>(
    O.some(({} as unknown) as BlobService.BlobResult)
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
    expect(O.isSome(maybeFiscalNumber)).toBe(true);
  });

  it("Should return an empty option when fiscal code is not present in saml payload", async () => {
    const maybeFiscalNumber = getFiscalNumberFromPayload(
      responseWithoutFiscalCodeXMLDocument
    );
    expect(O.isNone(maybeFiscalNumber)).toBe(true);
  });
});

describe("getRequestIDFromPayload", () => {
  it("Should return an option containing a request id from saml payload when present", async () => {
    const maybeRequestId = getRequestIDFromPayload(
      "Response",
      "InResponseTo"
    )(responseXMLDocument);
    expect(O.isSome(maybeRequestId)).toBe(true);
  });

  it("Should return an empty option when request id is not present in saml payload", async () => {
    const maybeRequestId = getRequestIDFromPayload(
      "Response",
      "InResponseTo"
    )(responseWithoutRequestIdXMLDocument);
    expect(O.isNone(maybeRequestId)).toBe(true);
  });
});

describe("getRequestIDFromRequest", () => {
  it("Should return an option containing a request id from saml request", async () => {
    const maybeRequestId = getRequestIDFromRequest(requestXMLDocument);
    expect(O.isSome(maybeRequestId)).toBe(true);
  });
});

describe("getRequestIDFromResponse", () => {
  it("Should return an option containing a request id from saml response when present", async () => {
    const maybeRequestId = getRequestIDFromResponse(responseXMLDocument);
    expect(O.isSome(maybeRequestId)).toBe(true);
  });

  it("Should return an empty option when request id is not present in saml response", async () => {
    const maybeRequestId = getRequestIDFromResponse(
      responseWithoutRequestIdXMLDocument
    );
    expect(O.isNone(maybeRequestId)).toBe(true);
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
    )();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).toBeCalledTimes(1);
    expect(E.isRight(result)).toBe(true);
  });

  it("Should return left when encrypt fails", async () => {
    spiedToEncryptedPayload.mockImplementationOnce((_, __) =>
      E.left(E.toError("any error"))
    );

    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    )();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).not.toBeCalled();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toEqual(
        "StoreSpidLogs|ERROR=Cannot encrypt payload|Error: any error"
      );
    }
  });

  it("Should return left when SpidBlobItem decoding fails", async () => {
    spiedToEncryptedPayload.mockImplementationOnce((_, __) =>
      // this will cause decoding to fail because cypherText is missing
      E.right(({
        iv: "iv",
        encryptedKey: "ek",
      } as unknown) as encrypt.EncryptedPayload)
    );

    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    )();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).not.toBeCalled();
    expect(E.isLeft(result)).toBe(true);
  });

  it("Should return left when UpsertBlobFromObject fails", async () => {
    spiedUpsertBlobFromObject.mockImplementationOnce(() =>
      TE.left<Error, O.Option<BlobService.BlobResult>>(E.toError("any error"))
    );

    const result = await storeSpidLogs(
      mockedBlobService,
      mockedContainerName,
      mockedPublicKey,
      mockedSpidLogMessage
    )();

    expect(spiedToEncryptedPayload).toBeCalledTimes(2);
    expect(spiedUpsertBlobFromObject).toBeCalledTimes(1);
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toEqual("any error");
    }
  });
});
