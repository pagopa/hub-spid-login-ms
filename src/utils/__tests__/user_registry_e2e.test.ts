import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { CertificationEnum } from "../../../generated/userregistry-api/Certification";
import { UserRegistryAPIClient } from "../../clients/userregistry_client";
import { blurUser, getUserId } from "../user_registry";


it("e2e should retrieve a User by a CF", async () => {
  const response = await getUserId(
    UserRegistryAPIClient(
      "https://api.dev.userregistry.pagopa.it/user-registry-management/v1"
    ),
    "DNIVNI82L21L719J" as FiscalCode,
    "9b20e355f89c4a15bf3ee1f251d6d062" as NonEmptyString
  ).run();
  console.log(response);
});

it("e2e should create a User for a not found CF - Right path", async () => {
  const response = await blurUser(
    UserRegistryAPIClient(
      "https://api.dev.userregistry.pagopa.it/user-registry-management/v1"
    ),
    {
      certification: CertificationEnum.SPID,
      externalId: "DNIVNI82L21L719J",
      extras: {}
    },
    "DNIVNI82L21L719J" as FiscalCode,
    "9b20e355f89c4a15bf3ee1f251d6d062" as NonEmptyString
  ).run();
  console.log(response);
  console.log(JSON.stringify(response));
});


