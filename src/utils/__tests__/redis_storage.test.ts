import { pipe, flow } from "fp-ts/lib/function";

import {
  existsKeyTask,
  getTask,
  setWithExpirationTask
} from "../redis_storage";
import * as T from "fp-ts/lib/Task";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";
const aRedisDefaultExpiration = 10;

const setMock = jest.fn().mockResolvedValue("OK");
const getMock = jest.fn().mockResolvedValue(aRedisValue);
const existsMock = jest.fn().mockResolvedValue(1);
const redisClientMock = {
  exists: existsMock,
  get: getMock,
  set: setMock,
  setEx: setMock
};

describe("setWithExpirationTask", () => {
  it("should return true if redis store key-value pair correctly", async () => {
    const value = await pipe(
      await setWithExpirationTask(
        redisClientMock as any,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.fold(fail, T.of)
    )();
    expect(value).toEqual(true);
  });

  it("should return an error if redis store key-value pair returns undefined", async () => {
    setMock.mockResolvedValueOnce(undefined);
    const value = pipe(
      await setWithExpirationTask(
        redisClientMock as any,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.fold(T.of, fail)
    )();
    expect(value).toBeDefined();
  });

  it("should return an error if redis store key-value pair fails", async () => {
    setMock.mockRejectedValueOnce(new Error("Cannot store key-value pair"));
    const value = pipe(
      await setWithExpirationTask(
        redisClientMock as any,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.fold(T.of, fail)
    )();
    expect(value).toBeDefined();
  });
});

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", async () => {
    const res = await pipe(
      TE.tryCatch(getTask(redisClientMock as any, aRedisKey), () => E.toError),
      TE.fold(
        () => fail,
        maybeResult => flow(O.fromEither, O.fold(fail, T.of))(maybeResult)
      )
    )();
    if (O.isSome(res)) {
      expect(res.value).toEqual(aRedisValue);
    }
  });

  it("should return none if no value was found for the provided key", async () => {
    getMock.mockResolvedValueOnce(null);
    const value = pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.fold(fail, T.of)
    )();
    expect(O.isNone(await value)).toBeTruthy();
  });

  it("should return an error if redis get value fails", async () => {
    getMock.mockRejectedValueOnce(new Error("Cannot get value"));
    const res = pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.fold(T.of, fail)
    )();
    expect(res).toBeDefined();
  });
});

describe("existsTask", () => {
  it("should return true if key exists in redis", async () => {
    const exists = await pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.fold(fail, T.of)
    )();
    expect(exists).toBeTruthy();
  });

  it("should return false if key does not exists in redis", async () => {
    existsMock.mockResolvedValueOnce(0);
    const exists = await pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.fold(fail, T.of)
    )();
    expect(exists).toBeFalsy();
  });

  it("should return an error if redis exists fails", async () => {
    existsMock.mockRejectedValueOnce(
      new Error("Cannot recognize exists on redis")
    );
    const res = await pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.fold(T.of, fail)
    )();
    expect(res).toBeDefined();
  });
});
