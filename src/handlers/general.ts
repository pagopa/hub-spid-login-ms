import * as express from "express";
import { toError } from "fp-ts/lib/Either";

import * as TE from "fp-ts/lib/TaskEither";
import * as redis from "redis";
import { flow, pipe } from "fp-ts/lib/function";
import { AdeAPIClient } from "../clients/ade";
import { getConfigOrThrow } from "../utils/config";
import { errorsToError } from "../utils/conversions";
import { pingTask } from "../utils/redis_storage";

const config = getConfigOrThrow();

export const getHealthcheckHandler = (
  redisClient: redis.RedisClientType | redis.RedisClusterType
) => (_: express.Request, res: express.Response): Promise<express.Response> =>
  // first ping for redis
  pipe(
    // TODO: Check if the casting will cause an error with RedisClusterType
    pingTask(redisClient as redis.RedisClientType),
    TE.chain(() =>
      // if Attribute Authority is enabled check for service is up&running
      config.ENABLE_ADE_AA
        ? pipe(
            TE.tryCatch(
              () => AdeAPIClient(config.ADE_AA_API_ENDPOINT).ping({}),
              toError
            ),
            TE.chain(flow(TE.fromEither, TE.mapLeft(errorsToError))),
            TE.chain(response =>
              response.status === 200
                ? TE.right(true)
                : TE.left(new Error(response.value.detail))
            )
          )
        : TE.right(true)
    ),
    TE.mapLeft(err => res.status(500).json(err.message)),
    TE.map(() => res.status(200).json("OK")),
    TE.toUnion
  )();
