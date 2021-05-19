import * as express from "express";
import { toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromLeft,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { RedisClient } from "redis";
import { AdeAPIClient } from "../clients/ade";
import { getConfigOrThrow } from "../utils/config";
import { errorsToError } from "../utils/conversions";
import { pingTask } from "../utils/redis_storage";

const config = getConfigOrThrow();

export const healthcheckHandler = (redisClient: RedisClient) => (
  _: express.Request,
  res: express.Response
) =>
  // first ping for redis
  pingTask(redisClient)
    .chain(() =>
      // if Attribute Authority is enabled check for service is up&running
      config.ENABLE_ADE_AA
        ? tryCatch(
            () => AdeAPIClient(config.ADE_AA_API_ENDPOINT).ping({}),
            toError
          )
            .chain(__ => fromEither(__).mapLeft(errs => errorsToError(errs)))
            .chain(response =>
              response.status === 200
                ? taskEither.of(true)
                : fromLeft(new Error(response.value.detail))
            )
        : taskEither.of(true)
    )
    .fold(
      err => res.status(500).json(err.message),
      () => res.status(200).json("OK")
    )
    .run();
