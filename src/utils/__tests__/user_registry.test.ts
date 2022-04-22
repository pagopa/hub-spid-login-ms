import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { UserRegistryAPIClient } from "../../clients/userregistry_client";
import { blurUser, getUserId, postUser } from "../user_registry";
import { UserSeed } from "../../../generated/userregistry-api/UserSeed";
import { CertificationEnum } from "../../../generated/userregistry-api/Certification";
import { User } from "../../../generated/userregistry-api/User";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

const aMockFiscalCode = "AAAAAA00A00A000A" as FiscalCode;
const aUserId = "1000" as NonEmptyString;
const apiKey = "afakeapikey" as NonEmptyString;

const aMockValidId = {
  id: aUserId,
};
const aMockUserSeed: UserSeed = {
  certification: CertificationEnum.SPID,
  externalId: "AAAAAA00A00A000A",
  extras: {
    email: "test@email.com",
  },
  name: "Nome",
  surname: "Cognome",
};
const aMockUser: User = {
  certification: CertificationEnum.SPID,
  externalId: "AAAAAA00A00A000A",
  extras: {
    email: "test@email.com",
  },
  id: aUserId,
  name: "Nome",
  surname: "Cognome",
};
const createUserMock = jest.fn().mockImplementation(async () =>
  E.right({
    status: 201,
    value: aMockUser,
  })
);
const getUserByExternalIdMock = jest.fn().mockImplementation(async () =>
  E.right({
    status: 200,
    value: aMockValidId,
  })
);
const userRegistryApiClientMock = ({
  createUser: createUserMock,
  getUserByExternalId: getUserByExternalIdMock,
} as unknown) as ReturnType<UserRegistryAPIClient>;

describe("UserRegistry#getUserId", () => {
  it("should get a valid User ID - Right path", async () => {
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    )();
    expect(E.isRight(response)).toBeTruthy();
    if (E.isRight(response) && O.isSome(response.right)) {
      expect(O.isSome(response.right)).toBeTruthy();
      expect(response.right.value).toEqual(aMockValidId);
    }
  });
  it("should send a none for a not found CF (404) - Right path", async () => {
    getUserByExternalIdMock.mockImplementationOnce(async () =>
      E.right({ status: 404, title: "Not Found" })
    );
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    )();
    expect(E.isRight(response)).toBeTruthy();
    if (E.isRight(response) && O.isSome(response.right)) {
      expect(O.isSome(response.right)).toBeTruthy();
      expect(response.right.value).toEqual(undefined);
    }
  });
  it("should raise a network error - Left path", async () => {
    getUserByExternalIdMock.mockImplementationOnce(async () => {
      throw new Error("Error");
    });
    const response = await getUserId(
      userRegistryApiClientMock,
      aMockFiscalCode,
      apiKey
    )();
    expect(E.isLeft(response)).toBeTruthy();
    if (E.isLeft(response)) {
      expect(response.left).toHaveProperty("kind", "IResponseErrorInternal");
    }
  });
});

describe("UserRegistry#postUser#ClientMock", () => {
  it("should create a User - Right path", async () => {
    const response = await postUser(
      userRegistryApiClientMock,
      aMockUser,
      apiKey
    )();
    expect(E.isRight(response)).toBe(true);
    if (E.isRight(response)) {
      expect(response.right).toBeTruthy();
      expect(response.right).toEqual(aMockUser);
    }
  });
  it("should not create a user for bad input - Left path", async () => {
    createUserMock.mockImplementationOnce(async () =>
      E.right({
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
    )();
    expect(E.isLeft(response)).toBeTruthy();
    if (E.isLeft(response)) {
      expect(response.left).toHaveProperty(
        "detail",
        "Bad Input: Error creating the user"
      );
      expect(response.left).toHaveProperty("kind", "IResponseErrorValidation");
    }
  });
  it("should reject for a network error - Left path", async () => {
    createUserMock.mockImplementationOnce(async () => {
      throw new Error("Error");
    });
    const response = await postUser(
      userRegistryApiClientMock,
      aMockUser,
      apiKey
    )();
    expect(E.isLeft(response)).toBeTruthy();
    if (E.isLeft(response)) {
      expect(response.left).toHaveProperty("kind", "IResponseErrorInternal");
    }
  });
});

describe("UserRegistry#blurUser", () => {
  it("should return an User UID from getUserId - Right path", async () => {
    const response = await blurUser(
      userRegistryApiClientMock,
      aMockUser,
      aMockFiscalCode,
      apiKey
    )();
    expect(E.isRight(response)).toBe(true);
    if (E.isRight(response) && O.isSome(response.right)) {
      expect(O.isSome(response.right)).toBeTruthy();
      expect(response.right.value).toEqual(aMockValidId);
    }
  });
  it("should create a User for a not found CF - Right path", async () => {
    getUserByExternalIdMock.mockImplementationOnce(async () =>
      E.right({ status: 404, title: "Not Found" })
    );
    const response = await blurUser(
      userRegistryApiClientMock,
      aMockUser,
      aMockFiscalCode,
      apiKey
    )();

    if (E.isRight(response) && O.isSome(response.right)) {
      expect(O.isSome(response.right)).toBeTruthy();
      expect(response.right.value).toEqual(aMockValidId);
    }
  });
  it("should not create a user for bad input - Left path", async () => {
    getUserByExternalIdMock.mockImplementationOnce(async () =>
      E.right({ status: 404, title: "Not Found" })
    );
    createUserMock.mockImplementationOnce(async () =>
      E.right({
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
    )();
    expect(E.isLeft(response)).toBeTruthy();
    if (E.isLeft(response)) {
      expect(response.left).toHaveProperty(
        "detail",
        "Bad Input: Error creating the user"
      );
      expect(response.left).toHaveProperty("kind", "IResponseErrorValidation");
    }
  });
});
