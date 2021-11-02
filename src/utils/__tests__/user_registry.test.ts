import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { CertificationEnumEnum } from "../../../generated/userregistry-api/CertificationEnum";
import { UserRegistryAPIClient } from "../../clients/userregistry_client";
import { blurUser, getUserId, postUser } from '../user_registry';
import { isNone, isSome } from "fp-ts/lib/Option";
import { isRight, right } from "fp-ts/lib/Either";
import * as config from "../config";

const aUserId = "1000" as NonEmptyString;
const aMockFiscalCode = 'AAAAAA00A00A000A' as FiscalCode
const aMockValidId = {
  id: aUserId
}
const aMockUser = {
  certification: CertificationEnumEnum.SPID,
  email: 'test@email.com',
  externalId: 'AAAAAA00A00A000A',
  name: 'Nome',
  surname: 'Cognome',
}
const aCreatedMockUser = {
  certification: CertificationEnumEnum.SPID,
  email: 'test@email.com',
  externalId: 'AAAAAA00A00A000A',
  id: aUserId,
  name: 'Nome',
  surname: 'Cognome'
}
const createUserMock = (status) => {
  switch(status) {
    case 201: return jest.fn().mockImplementation(() =>
      Promise.resolve(
        right({
          status: 201,
          value: aCreatedMockUser
        })
      ));
    case 400: return jest.fn().mockImplementation(() =>
      Promise.resolve(
        right({
          status: 400,
          value: {
            title: 'Bad Input',
            detail: 'Not valid input for creating a user'
          }
        })
      ));
    default: return jest.fn().mockImplementation(() =>
      Promise.reject({
        value: 'Permanent Error'
      }))
  }
};

const getUserIdByExternalIdMock = (status) => {
  switch(status) {
    case 200: return jest.fn().mockImplementation(() =>
      Promise.resolve(
        right({
          status: 200,
          value: {
            id: aMockValidId.id
          }
        })
      )
    )
    case 404: return jest.fn().mockImplementation(() => {
        return Promise.resolve(right({status: 404, title: 'Not Found'}))
      }
    )
  }
};

const mockUserRegistryApiClient = status => {
  if(Array.isArray(status)) {
    const [first, second] = status;
    return {
      createUser: createUserMock(second),
      getUserIdByExternalId: getUserIdByExternalIdMock(first)
    } as any
  } else {
    return {
      createUser: createUserMock(status),
      getUserIdByExternalId: getUserIdByExternalIdMock(status)
    } as any
  }
};

const TEST_CONFIG = {
  ENABLE_USER_REGISTRY: true,
  USER_REGISTRY_URL: 'https://127.0.0.1',
} as config.IConfig

const mockFetchJson = jest.fn();
const getMockUserIdByExternalId = (res) =>
  jest.fn().mockImplementationOnce(async () => (await {
    json: mockFetchJson,
    status: res
  })
);


describe("UserRegistry#getUserId", () => {
  it("should get a valid User ID - Right path", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve(aMockValidId)
    );
    // const mockFetchNew = jest.fn().mockImplementationOnce(() => Promise.resolve({
    //   status: 200,
    //   json: mockFetchJson
    // }));
    const mockFetch = getMockUserIdByExternalId(200);
    if(TEST_CONFIG.ENABLE_USER_REGISTRY) {
      const client = UserRegistryAPIClient(TEST_CONFIG.USER_REGISTRY_URL, mockFetch);
      const response = await getUserId(client, aMockFiscalCode).run()

      expect(response.isRight()).toBeTruthy();
      if (isRight(response)) {
        expect(isSome(response.value)).toBeTruthy();
        expect(response.value.toUndefined()).toEqual(aMockValidId)
      };
    }

  });
  it("should send a none for a not found CF (404) - Right path", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve({status: 404, title: 'Not Found'})
    );
    const mockFetch = getMockUserIdByExternalId(404);
    if(TEST_CONFIG.ENABLE_USER_REGISTRY) {
      const client = UserRegistryAPIClient(TEST_CONFIG.USER_REGISTRY_URL, mockFetch);
      const response = await getUserId(client, aMockFiscalCode).run()

      expect(response.isRight()).toBeTruthy();
      if (isRight(response)) {
        expect(isNone(response.value)).toBeTruthy();
        expect(response.value.toUndefined()).toEqual(undefined)
      };
    }

  });
  it("should raise a network error - Left path", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve({})
    );
    // Provo a simulare un errore con la Promise.reject e status 500 :)
    const mockFetch = jest.fn().mockImplementationOnce(() => Promise.reject({
      status: 500,
      json: mockFetchJson
    }));
    if(TEST_CONFIG.ENABLE_USER_REGISTRY) {
      const client = UserRegistryAPIClient(TEST_CONFIG.USER_REGISTRY_URL, mockFetch);
      const response = await getUserId(client, aMockFiscalCode).run();

      expect(response.isLeft()).toBeTruthy();
      expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");

    }

  });
  it("should not pass decode validation for a bad response payload - Left path", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve({})
    );
    // Provo a simulare un payload errato in Promise.resolve :)
    const mockFetch = jest.fn().mockImplementationOnce(() => Promise.resolve({
      statu: 200,
      json: mockFetchJson
    }));
    if(TEST_CONFIG.ENABLE_USER_REGISTRY) {
      const client = UserRegistryAPIClient(TEST_CONFIG.USER_REGISTRY_URL, mockFetch);
      const response = await getUserId(client, aMockFiscalCode).run();

      expect(response.isLeft()).toBeTruthy();
      expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");
    }

  });
});

describe("UserRegistry#postUser#ClientMock", () => {
  it("should create a User - Right path", async () => {
    const response = await postUser(mockUserRegistryApiClient(201), aMockUser).run()
    expect(response.isRight()).toBeTruthy();
    if (isRight(response)) {
      expect(response.value).toBeTruthy();
      expect(response.value).toEqual(aCreatedMockUser)
    };
  });
  it("should not create a user for bad input - Left path", async () => {
    const response = await postUser(mockUserRegistryApiClient(400), aMockUser).run()
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("detail", "Bad Input: Not valid input for creating a user");
    expect(response.value).toHaveProperty("kind", "IResponseErrorValidation");
  });
  it("should reject - Left path", async () => {
    const response = await postUser(mockUserRegistryApiClient(500), aMockUser).run()
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");
  });
});

describe("UserRegistry#blurUser", () => {
  it("should return a User UID from getUserId - Right path", async () => {
    const response = await blurUser(mockUserRegistryApiClient(200), aMockUser, aMockFiscalCode).run()
    expect(response.isRight()).toBeTruthy();
    if (isRight(response)) {
      expect(response.value).toBeTruthy();
      expect(response.value).toHaveProperty("id", aMockValidId.id)
    };
  });

  it("should create a User for a not found CF - Right path", async () => {
    const response = await blurUser(mockUserRegistryApiClient([404, 201]), aMockUser, aMockFiscalCode).run()
    if (isRight(response)) {
      expect(response.value).toBeTruthy();
      expect(response.value).toHaveProperty("id", aMockValidId.id)
    };

  });

  it("should not create a user for bad input - Left path", async () => {
    const response = await blurUser(mockUserRegistryApiClient([404, 400]), aMockUser, aMockFiscalCode).run()
    expect(response.isLeft()).toBeTruthy();
    expect(response.value).toHaveProperty("kind", "IResponseErrorInternal");

  });

});