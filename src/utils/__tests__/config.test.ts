import { pipe } from "fp-ts/function";
import * as E from "fp-ts/Either";
import { AWSEndpoint, UrlFromStringWithoutNulls } from "../config";
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
