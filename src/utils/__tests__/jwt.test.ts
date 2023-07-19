import * as E from "fp-ts/lib/Either";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { TokenUser, TokenUserL2, UserCompanies } from "../../types/user";
import { getUserJwt } from "../jwt";
import * as jwt from "jsonwebtoken";
import { SpidLevelEnum } from "../spid";

const aPrivateRsaKey = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAPX91rBDbLk5Pr0/lf4y1a8oz75sYa+slTqpfVHUrYb22qy4rY6Z
B0rXvTeLPgCAXUfGFJu4qSJcbu7yhBrPx30CAwEAAQJBALRCvEVUU2L0IRabdvXd
GJuP45ReZcNPS9e+BhimKjcgVFmyrpmiItNBHKFyTM8uL8dHXen1ReUgZOHcPKpV
MF0CIQD8KxN+ZhrxPIMPEJJJOO/Pn4y3iZRowulkaFDFUMUzzwIhAPm6vD95LAJW
DyC2relGDbA6h/YrBg38fcr1KQgxe0bzAiAcUL30oIR/+BqDU4oJnNIYz0KezV0T
0mcgtjHzphkuswIgXbRK1IpUECBYls7VHNXTZw/fWmg0YmUeklxBZDik6C8CIBXl
niQ7qszA7Uel9+wv2DwzWj+8OUcRzJAGOVD8cy2S
-----END RSA PRIVATE KEY-----` as NonEmptyString;
const companies: UserCompanies = [
  {
    email: "test@test.com" as EmailString,
    organization_fiscal_code: "01234567891" as OrganizationFiscalCode,
    organization_name: "Test Company" as NonEmptyString
  }
];
const tokenUser: TokenUser | TokenUserL2 = {
  fiscal_number: "AAAAAA00A00A000A" as FiscalCode,
  from_aa: true,
  companies,
  level: "L1",
  spidLevel: SpidLevelEnum["https://www.spid.gov.it/SpidL2"]
};
const tokenTtlSeconds = 3600 as NonNegativeInteger;
const aTokenAudience = "AUDIENCE" as NonEmptyString;
const aTokenIssuer = "ISSUER" as NonEmptyString;
const aKeyid = "AKEYID" as NonEmptyString;
const aTokenLengthBytesWithKeyId = 556;
const aTokenLengthBytesWithoutKeyId = 536;

describe("Generate a valid JWT Header", () => {
  it("should generate it with keyid as parameter", async () => {
    const errorOrNewJwtToken = await getUserJwt(
      aPrivateRsaKey,
      tokenUser,
      tokenTtlSeconds,
      aTokenIssuer,
      aKeyid
    )();

    expect(E.isRight(errorOrNewJwtToken)).toBeTruthy();
    if (E.isRight(errorOrNewJwtToken)) {
      expect(errorOrNewJwtToken.right).toHaveLength(aTokenLengthBytesWithKeyId);
      const decodedToken = jwt.decode(errorOrNewJwtToken.right, {
        complete: true
      });

      if (!decodedToken) {
        fail();
      }
      expect(decodedToken["header"].kid).toEqual(aKeyid);
      expect(decodedToken.payload.spidLevel).toEqual(
        SpidLevelEnum["https://www.spid.gov.it/SpidL2"]
      );
    }
  });
  it("should generate it without keyid as parameter", async () => {
    const errorOrNewJwtToken = await getUserJwt(
      aPrivateRsaKey,
      tokenUser,
      tokenTtlSeconds,
      aTokenIssuer
    )();
    expect(E.isRight(errorOrNewJwtToken)).toBeTruthy();
    if (E.isRight(errorOrNewJwtToken)) {
      expect(errorOrNewJwtToken.right).toHaveLength(
        aTokenLengthBytesWithoutKeyId
      );
    }
  });

  it("should generate it without keyid but with audience", async () => {
    const errorOrNewJwtToken = await getUserJwt(
      aPrivateRsaKey,
      tokenUser,
      tokenTtlSeconds,
      aTokenIssuer,
      undefined,
      aTokenAudience
    )();
    expect(E.isRight(errorOrNewJwtToken)).toBeTruthy();

    if (E.isRight(errorOrNewJwtToken)) {
      const decodedToken = jwt.decode(errorOrNewJwtToken.right, {
        complete: true
      });

      if (!decodedToken) {
        fail();
      }
      expect(decodedToken["payload"].aud).toEqual(aTokenAudience);
    }
  });

  it("should return an error if an error occurs during token generation", async () => {
    const errorOrNewJwtToken = await getUserJwt(
      "aPanInvalidRsaKey" as NonEmptyString,
      tokenUser,
      tokenTtlSeconds,
      aTokenIssuer
    )();
    expect(E.isLeft(errorOrNewJwtToken)).toBeTruthy();
  });
});
