import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { JWTParams } from "../config";

describe("Validate an unknown type as JWTParams Interface", () => {
  it("should validate a correct JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: true,
      JWT_TOKEN_ISSUER: "issuer",
      JWT_TOKEN_PRIVATE_KEY: "tokenprivatekey",
      ENABLE_USER_REGISTRY: false,
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(value.isRight()).toBe(true);
  });
  it("should validate a correct JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: true,
      JWT_TOKEN_ISSUER: "issuer" as NonEmptyString,
      JWT_TOKEN_PRIVATE_KEY: "tokenprivatekey" as NonEmptyString,
      JWT_TOKEN_KID: "tokenkid" as NonEmptyString,
      ENABLE_USER_REGISTRY: false,
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(value.isRight()).toBe(true);
  });
  it("should not validate an incorrect incoming JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: false,
      JWT_TOKEN_KID: "tokenkid" as NonEmptyString,
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(value.isLeft()).toBe(true);
  });
  it("should not validate an incorrect incoming JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: true,
      JWT_TOKEN_KID: "tokenkid" as NonEmptyString,
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(value.isLeft()).toBe(true);
  });
});
