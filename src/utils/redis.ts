import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as redis from "redis";
import * as TE from "fp-ts/TaskEither";
import { getConfigOrThrow } from "./config";
import { logger } from "./logger";
const config = getConfigOrThrow();

export const createSimpleRedisClient = async (
  redisUrl: string,
  password?: string,
  port?: string,
  enableTls: boolean = true
): Promise<redis.RedisClientType> => {
  const DEFAULT_REDIS_PORT = enableTls ? "6380" : "6379";
  const prefixUrl = enableTls ? "rediss://" : "redis://";
  const completeRedisUrl = `${prefixUrl}${redisUrl}`;

  const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);

  const redisClient = redis.createClient<
    Record<string, never>,
    Record<string, never>,
    Record<string, never>
  >({
    legacyMode: false,
    password,
    socket: {
      checkServerIdentity: (_hostname, _cert) => undefined,
      keepAlive: 2000,
      tls: enableTls
    },
    url: `${completeRedisUrl}:${redisPort}`
  });
  await redisClient.connect();
  return redisClient;
};

export const createClusterRedisClient = async (
  redisUrl: string,
  password?: string,
  port?: string,
  enableTls: boolean = true,
  useReplicas: boolean = true
): Promise<redis.RedisClusterType> => {
  const DEFAULT_REDIS_PORT = enableTls ? "6380" : "6379";
  const prefixUrl = enableTls ? "rediss://" : "redis://";
  const completeRedisUrl = `${prefixUrl}${redisUrl}`;

  const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);

  const redisClient = redis.createCluster<
    Record<string, never>,
    Record<string, never>,
    Record<string, never>
  >({
    defaults: {
      legacyMode: false,
      password,
      socket: {
        checkServerIdentity: (_hostname, _cert) => undefined,
        keepAlive: 2000,
        reconnectStrategy: retries => Math.min(retries * 100, 3000),
        tls: enableTls
      }
    },
    rootNodes: [
      {
        url: `${completeRedisUrl}:${redisPort}`
      }
    ],
    useReplicas
  });
  await redisClient.connect();
  return redisClient;
};

export const CreateRedisClientTask: TE.TaskEither<
  Error,
  redis.RedisClientType | redis.RedisClusterType
> = pipe(
  O.fromPredicate<boolean>(_ => _)(config.isProduction),
  O.mapNullable(_ => config.REDIS_CLUSTER_ENABLED),
  O.chain(O.fromPredicate(_ => _)),
  O.fold<
    boolean,
    TE.TaskEither<Error, redis.RedisClientType | redis.RedisClusterType>
  >(
    () =>
      TE.tryCatch(
        () =>
          createSimpleRedisClient(
            config.REDIS_URL,
            config.REDIS_PASSWORD,
            config.REDIS_PORT,
            config.REDIS_TLS_ENABLED
          ),
        () => new Error("Error Connecting to redis")
      ),
    () =>
      TE.tryCatch(
        () =>
          createClusterRedisClient(
            config.REDIS_URL,
            config.REDIS_PASSWORD,
            config.REDIS_PORT,
            config.REDIS_TLS_ENABLED
          ),
        () => new Error("Error Connecting redis cluster")
      )
  ),
  TE.chain(REDIS_CLIENT => {
    REDIS_CLIENT.on("connect", () => {
      logger.info("Client connected to redis...");
    });

    REDIS_CLIENT.on("ready", () => {
      logger.info("Client connected to redis and ready to use...");
    });

    REDIS_CLIENT.on("reconnecting", () => {
      logger.info("Client reconnecting...");
    });

    REDIS_CLIENT.on("error", err => {
      logger.info(`Redis error: ${err}`);
    });

    REDIS_CLIENT.on("end", () => {
      logger.info("Client disconnected from redis");
    });
    return TE.right(REDIS_CLIENT);
  })
);
