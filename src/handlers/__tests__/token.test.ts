import * as crypto from "crypto";
import * as redis from "redis";

import * as TE from "fp-ts/TaskEither";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { upgradeTokenHandler } from "../token";
import { EnabledAttributeAuthorityParams, IConfig } from "../../utils/config";

import mockReq from "../../__mocks__/request";
import mockRes from "../../__mocks__/response";
import { aFiscalCode } from "../../__mocks__/spid";
import { getUserJwt } from "../../utils/jwt";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { SpidLevelEnum } from "../../utils/spid";
import { TokenUser } from "../../types/user";
import { pipe } from "fp-ts/lib/function";

const mockRedisClient = {} as redis.RedisClientType | redis.RedisClusterType;

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem"
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem"
  }
});

const tokenTtlSeconds = 3600 as NonNegativeInteger;
const aTokenIssuer = "ISSUER" as NonEmptyString;
const aKeyid = "AKEYID" as NonEmptyString;
const aJwtAudience = "https://localhost" as NonEmptyString;

const config = {
  L1_TOKEN_HEADER_NAME: "x-token" as NonEmptyString,
  ENABLE_JWT: true,
  ENABLE_ADE_AA: true,
  JWT_TOKEN_PRIVATE_KEY: privateKey,
  JWT_TOKEN_ISSUER: aTokenIssuer,
  JWT_TOKEN_KID: aKeyid,
  JWT_TOKEN_AUDIENCE: aJwtAudience,
  L1_TOKEN_EXPIRATION: tokenTtlSeconds,
  L2_TOKEN_EXPIRATION: tokenTtlSeconds
} as IConfig & EnabledAttributeAuthorityParams;

describe("upgradeTokenHandler", () => {
  it("should return a valid token L2", async () => {
    const jwtPayload = {
      email: "info@email.it",
      family_name: "Rossi",
      fiscal_number: aFiscalCode,
      mobile_phone: "333333334",
      name: "Mario",
      spid_level: SpidLevelEnum["https://www.spid.gov.it/SpidL2"],
      companies: [
        {
          email: "company1@email.it",
          organization_fiscal_code: "COMPANY1",
          organization_name: "Org name 1"
        },
        {
          email: "company2@email.it",
          organization_fiscal_code: "COMPANY2",
          organization_name: "Org name 2"
        }
      ],
      from_aa: true,
      level: "L1"
    } as TokenUser;

    const jwt = await pipe(
      getUserJwt(
        privateKey as NonEmptyString,
        jwtPayload,
        tokenTtlSeconds,
        aTokenIssuer,
        aJwtAudience,
        aKeyid
      ),
      TE.getOrElseW(() => fail("Error generating JWT"))
    )();

    const aMockedRequest = mockReq({
      headers: {
        [config.L1_TOKEN_HEADER_NAME]: jwt
      }
    });
    const aMockedResponse = mockRes();

    aMockedRequest.body = { organization_fiscal_code: "COMPANY1" };

    const handler = upgradeTokenHandler(config, mockRedisClient);

    await handler(aMockedRequest, aMockedResponse);

    expect(aMockedResponse.status).toHaveBeenCalledWith(200);
    expect(aMockedResponse.json).toHaveBeenCalledWith({
      token: expect.any(String)
    });
  });
});
