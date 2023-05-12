import { RedisClient } from "./redis";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

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
  command: TE.TaskEither<Error, string | null>
): TE.TaskEither<Error, O.Option<string>> =>
  pipe(command, TE.map(O.fromNullable));

/**
 * Parse a Redis integer reply.
 *
 * @see https://redis.io/topics/protocol#integer-reply
 */
export const integerReplAsync = (expectedReply?: number) => (
  command: TE.TaskEither<Error, unknown>
): TE.TaskEither<Error, boolean> =>
  pipe(
    command,
    TE.map(reply => {
      if (expectedReply !== undefined && expectedReply !== reply) {
        return false;
      }
      return typeof reply === "number";
    })
  );

/**
 * Transform any Redis falsy response to an error
 *
 * @param response
 * @param error
 * @returns
 */
export const falsyResponseToErrorAsync = (error: Error) => (
  response: TE.TaskEither<Error, boolean>
): TE.TaskEither<Error, true> =>
  pipe(
    response,
    TE.chain(res => (res ? TE.right(res) : TE.left(error)))
  );

export const setWithExpirationTask = (
  redisClient: RedisClient,
  key: string,
  value: string,
  expirationInSeconds: number,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () => redisClient.SETEX(key, expirationInSeconds, value),
      E.toError
    ),
    singleStringReplyAsync,
    falsyResponseToErrorAsync(
      new Error(errorMsg ? errorMsg : "Error setting key value pair on redis")
    )
  );

export const getTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, O.Option<string>> =>
  pipe(
    TE.tryCatch(() => redisClient.GET(key), E.toError),
    singleValueReplyAsync
  );

export const existsKeyTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(() => redisClient.EXISTS(key), E.toError),
    integerReplAsync(1)
  );

export const setTask = (
  redisClient: RedisClient,
  key: string,
  value: string,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(() => redisClient.SET(key, value), E.toError),
    singleStringReplyAsync,
    falsyResponseToErrorAsync(
      new Error(errorMsg ? errorMsg : "Error setting key value pair on redis")
    )
  );

export const deleteTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(() => redisClient.DEL(key), E.toError),
    integerReplAsync(1),
    falsyResponseToErrorAsync(
      new Error("Error deleting key value pair on redis")
    )
  );

export const pingTask = (
  redisClient: RedisClient
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(() => redisClient.EXISTS("dummy key"), E.toError),
    integerReplAsync(0)
  );
