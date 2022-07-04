import {
  aSAMLRequest,
  aSAMLResponse,
  aSAMLResponseWithoutRequestId,
  aSAMLResponseWithoutFiscalCode,
} from "../../__mocks__/spid";
import { DOMParser } from "xmldom";
import {
  createAccessLogWriter,
  createAzureStorageAccessLogWriter,
  getFiscalNumberFromPayload,
  getRequestIDFromPayload,
  getRequestIDFromRequest,
  getRequestIDFromResponse,
  createAccessLogEncrypter,
} from "../access_log";

import * as azs from "azure-storage";
import { BlobService } from "azure-storage";
import {
  FiscalCode,
  IPString,
  NonEmptyString,
} from "@pagopa/ts-commons/lib/strings";
import { SpidBlobItem, SpidLogMsg } from "../../types/access_log";
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
import { pipe } from "fp-ts/lib/function";
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

jest.spyOn(azs, "createBlobService").mockImplementation(() => {
  return ({} as unknown) as BlobService;
});

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

const aPublicKey = "aPublicKey" as NonEmptyString;
const aValidSpidLogMessage = {
  createdAt: new Date(),
  createdAtDay: "2021-11-01",
  fiscalCode: "AAAAAA00A00A000A" as FiscalCode,
  ip: "0.0.0.0" as IPString,
  requestPayload: `a request payload ${Math.random()}`,
  responsePayload: `a response payload ${Math.random()}`,
  spidRequestId: "a spi request id",
};
describe("createAccessLogWriter", () => {
  it("should throw when creating writer for an unsupported storage kind", () => {
    // lazy function so we can catch error
    const lazyCreate = () =>
      createAccessLogWriter({ SPID_LOGS_STORAGE_KIND: "unsupported" } as any);

    expect(lazyCreate).toThrowError();
  });

  it.each`
    name               | config
    ${"Azure Storage"} | ${{ SPID_LOGS_STORAGE_KIND: "azurestorage", SPID_LOGS_STORAGE_CONTAINER_NAME: "any", SPID_LOGS_STORAGE_CONNECTION_STRING: "any" }}
    ${"Aws S3"}        | ${{ SPID_LOGS_STORAGE_KIND: "awss3", SPID_LOGS_STORAGE_CONTAINER_NAME: "any" }}
  `("should support $name", ({ config }) => {
    // lazy function so we can catch error
    const lazyCreate = () => createAccessLogWriter(config);

    expect(lazyCreate).not.toThrowError();
  });
});

describe("toSpidBlobItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should build encrypted Blob items from  valid messages", () => {
    const blobItemOrError = createAccessLogEncrypter(aPublicKey)(
      aValidSpidLogMessage
    );

    if (E.isRight(blobItemOrError)) {
      // both request and response payload must be encypted
      expect(spiedToEncryptedPayload).toBeCalledTimes(2);
      expect(spiedToEncryptedPayload).toHaveBeenCalledWith(
        aPublicKey,
        aValidSpidLogMessage.requestPayload
      );
      expect(spiedToEncryptedPayload).toHaveBeenCalledWith(
        aPublicKey,
        aValidSpidLogMessage.responsePayload
      );

      // SpidBlobItem is correctly formatted
      expect(SpidBlobItem.is(blobItemOrError.right)).toBe(true);
    } else {
      fail(`expected to be right, error: ${blobItemOrError.left.message}`);
    }
  });

  it("should fail if at least one encyption fail", () => {
    spiedToEncryptedPayload.mockImplementationOnce(() =>
      E.left(new Error("unexpected"))
    );

    const blobItemOrError = createAccessLogEncrypter(aPublicKey)(
      aValidSpidLogMessage
    );

    if (E.isRight(blobItemOrError)) {
      fail(`expected to be left`);
    } else {
      expect(blobItemOrError.left).toEqual(expect.any(Error));
    }
  });
});

describe("createAzureStorageAccessLogWriter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockedBlobService = ({} as unknown) as BlobService;
  const mockedContainerName = "aContainer" as NonEmptyString;
  const mockedPublicKey = "aPublicKey" as NonEmptyString;
  const mockedSpidBLogItem = pipe(
    createAccessLogEncrypter(mockedPublicKey)(aValidSpidLogMessage),
    E.getOrElseW((err) => {
      fail(
        `Cannot build SpidBlobItem, please check either the function or mock data, ${err.message}`
      );
    })
  );

  it("Should return right when spid log message is correctly saved", async () => {
    const accessLogWriter = createAzureStorageAccessLogWriter(
      mockedBlobService,
      mockedContainerName
    );
    const result = await accessLogWriter(mockedSpidBLogItem, "anyname")();

    expect(spiedUpsertBlobFromObject).toBeCalledTimes(1);
    expect(E.isRight(result)).toBe(true);
  });

  it("Should return left when UpsertBlobFromObject fails", async () => {
    spiedUpsertBlobFromObject.mockImplementationOnce(() =>
      TE.left<Error, O.Option<BlobService.BlobResult>>(E.toError("any error"))
    );

    const accessLogWriter = createAzureStorageAccessLogWriter(
      mockedBlobService,
      mockedContainerName
    );
    const result = await accessLogWriter(mockedSpidBLogItem, "anyname")();

    expect(spiedUpsertBlobFromObject).toBeCalledTimes(1);
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toEqual("any error");
    }
  });
});
