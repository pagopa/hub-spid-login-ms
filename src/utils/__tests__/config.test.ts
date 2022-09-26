import { pipe } from "fp-ts/function";
import * as E from "fp-ts/Either";
import { AWSEndpoint, SpidLogsStorageConfiguration } from "../config";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
describe("AWSEndpoint", () => {
  it.each`
    input                       | expected
    ${"http://localhost"}       | ${{ hostname: "localhost", protocol: "http:" }}
    ${"http://localhost:10000"} | ${{ hostname: "localhost", port: 10000, protocol: "http:" }}
  `("Allows $input", ({ input, expected }) => {
    pipe(
      input,
      AWSEndpoint.decode,
      E.fold(
        (err) => fail(`Cannot parse ${input}, error: ${readableReport(err)}`),
        (value) => {
          expect(value).toEqual(expect.objectContaining(expected));
        }
      )
    );
  });
});

describe("SpidLogsStorageConfiguration", () => {
  it("should decode with default timeout if not provided for Aws S3", () => {
    const anAwsS3WithoutTimeout = {
      SPID_LOGS_STORAGE_KIND: "awss3",
      SPID_LOGS_STORAGE_CONTAINER_NAME: "a-container-name",
    };

    pipe(
      anAwsS3WithoutTimeout,
      SpidLogsStorageConfiguration.decode,
      E.fold(
        (err) => fail(`Cannot parse input, error: ${readableReport(err)}`),
        (value) => {
          expect(value).toEqual(
            expect.objectContaining({
              SPID_LOGS_STORAGE_CONNECTION_TIMEOUT: expect.any(Number),
            })
          );
        }
      )
    );
  });

  it("should decode a give timeout for Aws S3", () => {
    const anAwsS3WithoutTimeout = {
      SPID_LOGS_STORAGE_KIND: "awss3",
      SPID_LOGS_STORAGE_CONTAINER_NAME: "a-container-name",
      SPID_LOGS_STORAGE_CONNECTION_TIMEOUT: "100",
    };

    pipe(
      anAwsS3WithoutTimeout,
      SpidLogsStorageConfiguration.decode,
      E.fold(
        (err) => fail(`Cannot parse input, error: ${readableReport(err)}`),
        (value) => {
          expect(value).toEqual(
            expect.objectContaining({
              SPID_LOGS_STORAGE_CONNECTION_TIMEOUT: 100,
            })
          );
        }
      )
    );
  });
});
