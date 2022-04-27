import { SpidBlobItem, SpidLogMsg } from "../access_log";
import * as E from "fp-ts/lib/Either";

describe("SpidBlobItem", () => {
  it("Should succeed decoding a valid object", async () => {
    const decoded = SpidBlobItem.decode({
      createdAt: new Date(),
      ip: "0.0.0.0",
      encryptedRequestPayload: {
        cypherText: "encoded",
        iv: "iv",
        encryptedKey: "ek",
      },
      encryptedResponsePayload: {
        cypherText: "encoded",
        iv: "iv",
        encryptedKey: "ek",
      },
      spidRequestId: "1234567890",
    });

    expect(E.isRight(decoded)).toBe(true);
  });

  it("Should succeed decoding a valid object 2", async () => {
    const decoded = SpidBlobItem.decode({
      createdAt: "2018-10-13T00:00:00.000Z",
      ip: "0.0.0.0",
      encryptedRequestPayload: {
        cypherText: "encoded",
        iv: "iv",
        encryptedKey: "ek",
      },
      encryptedResponsePayload: {
        cypherText: "encoded",
        iv: "iv",
        encryptedKey: "ek",
      },
      spidRequestId: "1234567890",
    });

    expect(E.isRight(decoded)).toBe(true);
  });

  it("Should fail decoding an invalid object", async () => {
    const decoded = SpidBlobItem.decode({
      createdAt: "Wed, 17 Nov 2021 16:52:56 GMT",
    });

    expect(E.isRight(decoded)).toBe(false);
  });
});

describe("SpidLogMsg", () => {
  it("Should succeed decoding a valid object", async () => {
    const decoded = SpidLogMsg.decode({
      createdAt: new Date(),
      createdAtDay: "2021-11-01",
      fiscalCode: "AAAAAA00A00A000A",
      ip: "0.0.0.0",
      requestPayload: "a request payload",
      responsePayload: "a response payload",
      spidRequestId: "a spi request id",
    });

    expect(E.isRight(decoded)).toBe(true);
  });

  it("Should succeed decoding a valid object 2", async () => {
    const decoded = SpidLogMsg.decode({
      createdAt: "2018-10-13T00:00:00.000Z",
      createdAtDay: "2021-11-01",
      fiscalCode: "AAAAAA00A00A000A",
      ip: "0.0.0.0",
      requestPayload: "a request payload",
      responsePayload: "a response payload",
      spidRequestId: "a spi request id",
    });

    expect(E.isRight(decoded)).toBe(true);
  });

  it("Should fail decoding an invalid object", async () => {
    const decoded = SpidLogMsg.decode({
      createdAt: "Wed, 17 Nov 2021 16:52:56 GMT",
    });

    expect(E.isRight(decoded)).toBe(false);
  });
});
