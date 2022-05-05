import { JWTParams } from "../config";
import * as E from "fp-ts/lib/Either";

describe("Validate an unknown type as JWTParams Interface", () => {
  it("should validate a correct JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: true,
      JWT_TOKEN_ISSUER: "issuer",
      JWT_TOKEN_PRIVATE_KEY: "tokenprivatekey",
      ENABLE_USER_REGISTRY: false,
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(E.isRight(value)).toBe(true);
  });
  it("should validate a correct JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: true,
      JWT_TOKEN_ISSUER: "issuer",
      JWT_TOKEN_PRIVATE_KEY: "tokenprivatekey",
      JWT_TOKEN_KID: "tokenkid",
      ENABLE_USER_REGISTRY: false,
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(E.isRight(value)).toBe(true);
  });
  it("should not validate an incorrect incoming JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: false,
      JWT_TOKEN_KID: "tokenkid",
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(E.isLeft(value)).toBe(true);
  });
  it("should not validate an incorrect incoming JWT Param", () => {
    const JWTParamMock: unknown = {
      ENABLE_JWT: true,
      JWT_TOKEN_KID: "tokenkid",
    };

    const value = JWTParams.decode(JWTParamMock);

    expect(E.isLeft(value)).toBe(true);
  });
});
