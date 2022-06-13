import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { blurUser } from "../user_registry";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { SaveUserDto } from "../../../generated/pdv-userregistry-api/SaveUserDto";
import { PersonalDatavaultAPIClient } from "../../clients/pdv_client";

const aUserId = "1000" as NonEmptyString;
const apiKey = "afakeapikey" as NonEmptyString;

const aMockValidId = {
  id: aUserId,
};

const aMockUser: SaveUserDto = {
  fiscalCode: "AAAAAA00A00A000A",
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

const saveUsingPATCHMock = jest.fn().mockImplementation(async () =>
  E.right({
    status: 200,
    value: aMockValidId,
  })
);
const personalDatavaultAPIClientMock = ({
  createUser: createUserMock,
  getUserByExternalId: getUserByExternalIdMock,
  saveUsingPATCH: saveUsingPATCHMock,
} as unknown) as ReturnType<PersonalDatavaultAPIClient>;

describe("UserRegistry#blurUser", () => {
  it("should return an User UID from getUserId - Right path", async () => {
    const response = await blurUser(
      personalDatavaultAPIClientMock,
      aMockUser,
      apiKey
    )();
    expect(E.isRight(response)).toBe(true);
    if (E.isRight(response)) {
      expect(response.right).toBeTruthy();
      expect(response.right).toEqual(aMockValidId);
    }
  });
  it("should create a User for a not found CF - Right path", async () => {
    getUserByExternalIdMock.mockImplementationOnce(async () =>
      E.right({ status: 404, title: "Not Found" })
    );
    const response = await blurUser(
      personalDatavaultAPIClientMock,
      aMockUser,
      apiKey
    )();

    if (E.isRight(response)) {
      expect(response.right).toBeTruthy();
      expect(response.right).toEqual(aMockValidId);
    }
  });
  it("should not create a user for bad input - Left path", async () => {
    saveUsingPATCHMock.mockImplementationOnce(async () =>
      E.left({
        status: 400,
        value: {
          title: "Bad Input",
          detail: "Not valid input for creating a user",
        },
      })
    );
    const response = await blurUser(
      personalDatavaultAPIClientMock,
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
});
