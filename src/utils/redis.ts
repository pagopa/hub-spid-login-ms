import { fromPredicate } from "fp-ts/lib/Option";
import * as redis from "redis";
import RedisClustr = require("redis-clustr");
import { getConfigOrThrow } from "./config";
const config = getConfigOrThrow();

function createSimpleRedisClient(
  redisUrl: string,
  password?: string,
  port?: string,
  useTls: boolean = true
): redis.RedisClient {
  const DEFAULT_REDIS_PORT = "6379";

  const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);
  return redis.createClient({
    auth_pass: password,
    host: redisUrl,
    port: redisPort,
    retry_strategy: retryOptions => {
      if (retryOptions.error && retryOptions.error.code === "ECONNREFUSED") {
        // End reconnecting on a specific error and flush all commands with
        // a individual error
        return new Error("The server refused the connection");
      }

      if (retryOptions.total_retry_time > 1000 * 60 * 60) {
        // End reconnecting after a specific timeout and flush all commands
        // with a individual error
        return new Error("Retry time exhausted");
      }

      if (retryOptions.attempt > 3) {
        // End reconnecting with built in error
        return undefined;
      }

      // Reconnect after
      return Math.min(retryOptions.attempt * 100, 3000);
    },
    socket_keepalive: true,
    tls: useTls ? { servername: redisUrl } : undefined
  });
}

function createClusterRedisClient(
  redisUrl: string,
  password?: string,
  port?: string
): redis.RedisClient {
  const DEFAULT_REDIS_PORT = "6379";

  const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);
  return new RedisClustr({
    redisOptions: {
      auth_pass: password,
      tls: {
        servername: redisUrl
      }
    },
    servers: [
      {
        host: redisUrl,
        port: redisPort
      }
    ]
  }) as redis.RedisClient; // Casting RedisClustr with missing typings to RedisClient (same usage).
}

export const REDIS_CLIENT = fromPredicate<boolean>(_ => _)(config.isProduction)
  .mapNullable(_ => config.REDIS_CLUSTER_ENABLED)
  .chain(fromPredicate(_ => _))
  .map(() =>
    createClusterRedisClient(
      config.REDIS_URL,
      config.REDIS_PASSWORD,
      config.REDIS_PORT
    )
  )
  .getOrElseL(() =>
    createSimpleRedisClient(
      config.REDIS_URL,
      config.REDIS_PASSWORD,
      config.REDIS_PORT,
      config.REDIS_TLS_ENABLED
    )
  );
