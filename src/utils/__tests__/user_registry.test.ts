import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { CertificationEnumEnum } from "../../../generated/userregistry-api/CertificationEnum";
import { UserRegistryAPIClient } from "../../clients/userregistry_client";
import { blurUser, getUserId, postUser } from "../user_registry";
import { isNone, isSome } from "fp-ts/lib/Option";
import { isRight, right } from "fp-ts/lib/Either";
import { UserId } from "../../../generated/userregistry-api/UserId";

const aMockFiscalCode = "AAAAAA00A00A000A" as FiscalCode;
const aUserId = "1000" as NonEmptyString;
const apiKey = "afakeapikey" as NonEmptyString;

const aMockValidId = {
  id: aUserId,
};
const aMockUser = {
  certification: CertificationEnumEnum.SPID,
  email: "test@email.com",
  externalId: "AAAAAA00A00A000A",
  id: aUserId,
  name: "Nome",
  surname: "Cognome",
};
const createUserMock = jest.fn().mockImplementation(async () =>
  right({
    status: 201,
    value: aMockUser,
  })
);
const getUserIdByExternalIdMock = jest.fn().mockImplementation(async () =>
  right({
    status: 200,
    value: aMockValidId,
  })
);
const userRegistryApiClientMock = ({
  createUser: createUserMock,
  getUserIdByExternalId: getUserIdByExternalIdMock,
} as unknown) as ReturnType<UserRegistryAPIClient>;

describe("UserRegistry#getUserId", () => {
  it("should get a valid User ID - Right path", async () => {
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    ).run();
    expect(response.isRight()).toBeTruthy();
    if (isRight(response)) {
      expect(isSome(response.value)).toBeTruthy();
      expect(response.value.toUndefined()).toEqual(aMockValidId);
    }
  });
  it("should send a none for a not found CF (404) - Right path", async () => {
    getUserIdByExternalIdMock.mockImplementationOnce(async () =>
      right({ status: 404, title: "Not Found" })
    );
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    ).run();
    expect(response.isRight()).toBeTruthy();
    if (isRight(response)) {
      expect(isNone(response.value)).toBeTruthy();
      expect(response.value.toUndefined()).toEqual(undefined);
    }
  });
  it("should raise a network error - Left path", async () => {
    getUserIdByExternalIdMock.mockImplementationOnce(async () => {
      throw new Error("Error");
    });
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    ).run();
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");
  });
  it("should not pass decode validation for a bad response payload - Left path", async () => {
    const decodeValueMock = UserId.decode({});
    getUserIdByExternalIdMock.mockImplementationOnce(
      async () => decodeValueMock
    );
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    ).run();
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");
  });
});

describe("UserRegistry#postUser#ClientMock", () => {
  it("should create a User - Right path", async () => {
    const response = await postUser(
      userRegistryApiClientMock,
      aMockUser,
      apiKey
    ).run();
    expect(response.isRight()).toBeTruthy();
    if (isRight(response)) {
      expect(response.value).toBeTruthy();
      expect(response.value).toEqual(aMockUser);
    }
  });
  it("should not create a user for bad input - Left path", async () => {
    createUserMock.mockImplementationOnce(async () =>
      right({
        status: 400,
        value: {
          title: "Bad Input",
          detail: "Not valid input for creating a user",
        },
      })
    );
    const response = await postUser(
      userRegistryApiClientMock,
      aMockUser,
      apiKey
    ).run();
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty(
      "detail",
      "Bad Input: Error creating the user"
    );
    expect(response.value).toHaveProperty("kind", "IResponseErrorValidation");
  });
  it("should reject for a network error - Left path", async () => {
    createUserMock.mockImplementationOnce(async () => {
      throw new Error("Error");
    });
    const response = await postUser(
      userRegistryApiClientMock,
      aMockUser,
      apiKey
    ).run();
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");
  });
});

describe("UserRegistry#blurUser", () => {
  it("should return an User UID from getUserId - Right path", async () => {
    const response = await blurUser(
      userRegistryApiClientMock,
      aMockUser,
      aMockFiscalCode,
      apiKey
    ).run();
    expect(response.isRight()).toBeTruthy();
    if (isRight(response)) {
      expect(isSome(response.value)).toBeTruthy();
      expect(response.value.toUndefined()).toEqual(aMockValidId);
    }
  });
  it("should create a User for a not found CF - Right path", async () => {
    getUserIdByExternalIdMock.mockImplementationOnce(async () =>
      right({ status: 404, title: "Not Found" })
    );
    const response = await blurUser(
      userRegistryApiClientMock,
      aMockUser,
      aMockFiscalCode,
      apiKey
    ).run();
    if (isRight(response)) {
      expect(isSome(response.value)).toBeTruthy();
      expect(response.value.toUndefined()).toEqual(aMockValidId);
    }
  });
  it("should not create a user for bad input - Left path", async () => {
    getUserIdByExternalIdMock.mockImplementationOnce(async () =>
      right({ status: 404, title: "Not Found" })
    );
    createUserMock.mockImplementationOnce(async () =>
      right({
        status: 400,
        value: {
          title: "Bad Input",
          detail: "Not valid input for creating a user",
        },
      })
    );
    const response = await blurUser(
      userRegistryApiClientMock,
      aMockUser,
      aMockFiscalCode,
      apiKey
    ).run();
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");
  });
});
