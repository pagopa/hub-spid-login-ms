// tslint:disable: no-any
import { toError } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import nodeFetch from "node-fetch";

const fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch;

const ResponseInfo = t.interface({
  body: t.any,
  statusCode: NonNegativeInteger
});
export type ResponseInfo = t.TypeOf<typeof ResponseInfo>;

export const fetchFromApi = (
  endpoint: string | Request,
  headers: any
): TaskEither<Error, ResponseInfo> =>
  tryCatch(() => fetchApi(endpoint, headers), toError).chain(response =>
    tryCatch(() => response.json(), toError).map(body => ({
      body,
      statusCode: response.status as NonNegativeInteger
    }))
  );
