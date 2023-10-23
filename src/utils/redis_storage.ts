import { Option } from "fp-ts/lib/Option";
import * as redis from "redis";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/Option";

/**
 * Parse a Redis given string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
export const givenStringReplyAsync = (message: string) => (
  command: TE.TaskEither<Error, string | null>
): TE.TaskEither<Error, boolean> =>
  pipe(
    command,
    TE.map(reply => reply === message)
  );

/**
 * Parse a Redis single string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
export const singleStringReplyAsync = (
  command: TE.TaskEither<Error, string | null>
): TE.TaskEither<Error, boolean> =>
  pipe(
    command,
    TE.map(reply => reply === "OK")
  );

/**
 * Parse a Redis single string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
export const singleValueReplyAsync = (
  command: TE.TaskEither<Error, unknown>
): TE.TaskEither<Error, Option<string>> =>
  pipe(
    command,
    TE.map(value => {
      if (value && typeof value === "string") {
        return O.some(value);
      }
      return O.none;
    })
  );

/**
 * Parse a Redis integer reply.
 *
 * @see https://redis.io/topics/protocol#integer-reply
 */
export const integerReplyAsync = (expectedReply?: number) => (
  command: TE.TaskEither<Error, unknown>
): TE.TaskEither<Error, boolean> =>
  pipe(
    command,
    TE.chain(reply => {
      if (expectedReply !== undefined && expectedReply !== reply) {
        return TE.right(false);
      }
      return TE.right(typeof reply === "number");
    })
  );

export const falsyResponseToErrorAsync = (error: Error) => (
  response: TE.TaskEither<Error, boolean>
): TE.TaskEither<Error, true> =>
  pipe(
    response,
    TE.chain(_ => (_ ? TE.right(_) : TE.left(error)))
  );

export const setWithExpirationTask = (
  redisClient: redis.RedisClientType | redis.RedisClusterType,
  key: string,
  value: string,
  expirationInSeconds: number,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () => redisClient.setEx(key, expirationInSeconds, value),
      E.toError
    ),
    singleStringReplyAsync,
    falsyResponseToErrorAsync(
      new Error(errorMsg ? errorMsg : "Error setting key value pair on redis")
    )
  );

export const setTask = (
  redisClient: redis.RedisClientType | redis.RedisClusterType,
  key: string,
  value: string,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(() => redisClient.set(key, value), E.toError),
    singleStringReplyAsync,
    falsyResponseToErrorAsync(
      new Error(errorMsg ? errorMsg : "Error setting key value pair on redis")
    )
  );

export const deleteTask = (
  redisClient: redis.RedisClientType | redis.RedisClusterType,
  key: string
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(() => redisClient.del(key), E.toError),
    integerReplyAsync()
  );

export const getTask = (
  redisClient: redis.RedisClientType | redis.RedisClusterType,
  key: string
): TE.TaskEither<Error, Option<string>> =>
  pipe(
    TE.tryCatch(() => redisClient.get(key), E.toError),
    singleValueReplyAsync
  );

export const existsKeyTask = (
  redisClient: redis.RedisClientType | redis.RedisClusterType,
  key: string
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(() => redisClient.exists(key), E.toError),
    integerReplyAsync(1)
  );

export const pingTask = (
  redisClient: redis.RedisClientType
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(() => redisClient.ping(), E.toError),
    givenStringReplyAsync("PONG")
  );
