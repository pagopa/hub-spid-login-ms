import { fromNullable, Option } from "fp-ts/lib/Option";
import { RedisClient } from "redis";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
/**
 * Parse a Redis given string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
export const givenStringReply = (
  err: Error | null,
  reply: string | undefined,
  message: string
): E.Either<Error, boolean> => {
  if (err) {
    return E.left<Error, boolean>(err);
  }

  return E.right<Error, boolean>(reply === message);
};

/**
 * Parse a Redis single string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
export const singleStringReply = (
  err: Error | null,
  reply: "OK" | undefined
): E.Either<Error, boolean> => {
  if (err) {
    return E.left<Error, boolean>(err);
  }

  return E.right<Error, boolean>(reply === "OK");
};

/**
 * Parse a Redis single string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
export const singleValueReply = (
  err: Error | null,
  reply: string | null
): E.Either<Error, Option<string>> => {
  if (err) {
    return E.left<Error, Option<string>>(err);
  }
  return E.right<Error, Option<string>>(fromNullable(reply));
};

/**
 * Parse a Redis integer reply.
 *
 * @see https://redis.io/topics/protocol#integer-reply
 */
export const integerReply = (
  err: Error | null,
  reply: unknown,
  expectedReply?: number
): E.Either<Error, boolean> => {
  if (err) {
    return E.left<Error, boolean>(err);
  }
  if (expectedReply !== undefined && expectedReply !== reply) {
    return E.right<Error, boolean>(false);
  }
  return E.right<Error, boolean>(typeof reply === "number");
};

export const falsyResponseToError = (
  response: E.Either<Error, boolean>,
  error: Error
): E.Either<Error, true> => {
  if (E.isLeft(response)) {
    return E.left(response.left);
  } else {
    if (response.right) {
      return E.right(true);
    }
    return E.left(error);
  }
};

export const setWithExpirationTask = (
  redisClient: RedisClient,
  key: string,
  value: string,
  expirationInSeconds: number,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, true>>((resolve) =>
          redisClient.set(
            key,
            value,
            "EX",
            expirationInSeconds,
            (err, response) =>
              resolve(
                falsyResponseToError(
                  singleStringReply(err, response),
                  new Error(
                    errorMsg
                      ? errorMsg
                      : "Error setting key value pair on redis"
                  )
                )
              )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const setTask = (
  redisClient: RedisClient,
  key: string,
  value: string,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, true>>((resolve) =>
          redisClient.set(key, value, (err, response) =>
            resolve(
              falsyResponseToError(
                singleStringReply(err, response),
                new Error(
                  errorMsg ? errorMsg : "Error setting key value pair on redis"
                )
              )
            )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const deleteTask = (redisClient: RedisClient, key: string) =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, boolean>>((resolve) =>
          redisClient.del(key, (err, response) =>
            resolve(
              falsyResponseToError(
                integerReply(err, response),
                new Error("Error deleting key value pair on redis")
              )
            )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const getTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, Option<string>> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, Option<string>>>((resolve) =>
          redisClient.get(key, (err, response) =>
            resolve(singleValueReply(err, response))
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const existsKeyTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, boolean>>((resolve) =>
          redisClient.exists(key, (err, response) =>
            resolve(integerReply(err, response, 1))
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const pingTask = (
  redisClient: RedisClient
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, true>>((resolve) =>
          redisClient.ping("ping message", (err, response) =>
            resolve(
              falsyResponseToError(
                givenStringReply(err, response, "ping message"),
                new Error("Error while pinging redis")
              )
            )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );
