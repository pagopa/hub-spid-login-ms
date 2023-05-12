import { identity, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as redis from "redis";
import { IConfig } from "./config";
import { logger } from "./logger";

const DEFAULT_REDIS_PORT = "6379";

export type RedisClient = redis.RedisClientType | redis.RedisClusterType;

export class RedisClientFactory {
  protected readonly config: IConfig;
  // eslint-disable-next-line functional/prefer-readonly-type
  protected redisClient: RedisClient | undefined;

  constructor(config: IConfig) {
    this.config = config;
  }

  public readonly getInstance = async (): Promise<RedisClient> => {
    if (!this.redisClient) {
      // eslint-disable-next-line functional/immutable-data
      this.redisClient = await pipe(
        this.config.isProduction,
        O.fromPredicate(identity),
        O.chainNullableK(_ => this.config.REDIS_CLUSTER_ENABLED),
        O.chain(O.fromPredicate(identity)),
        O.map(() =>
          this.createClusterRedisClient(
            this.config.REDIS_URL,
            this.config.REDIS_PASSWORD,
            this.config.REDIS_PORT
          )
        ),
        O.getOrElse(() =>
          this.createSimpleRedisClient(
            this.config.REDIS_URL,
            this.config.REDIS_PASSWORD,
            this.config.REDIS_PORT,
            this.config.REDIS_TLS_ENABLED
          )
        )
      );
    }

    this.redisClient.on("connect", () => {
      logger.info("Client connected to redis...");
    });

    this.redisClient.on("ready", () => {
      logger.info("Client connected to redis and ready to use...");
    });

    this.redisClient.on("reconnecting", () => {
      logger.info("Client reconnecting...");
    });

    this.redisClient.on("error", err => {
      logger.info(`Redis error: ${err}`);
    });

    this.redisClient.on("end", () => {
      logger.info("Client disconnected from redis");
    });

    return this.redisClient;
  };

  protected readonly createSimpleRedisClient = async (
    redisUrl: string,
    password?: string,
    port?: string,
    useTls: boolean = true
  ): Promise<RedisClient> => {
    const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);
    const redisClientConnection = redis.createClient<
      redis.RedisDefaultModules,
      Record<string, never>,
      Record<string, never>
    >({
      password,
      socket: {
        port: redisPort,
        tls: useTls
      },
      url: `redis://${redisUrl}`
    });
    await redisClientConnection.connect();
    return redisClientConnection;
  };

  protected readonly createClusterRedisClient = async (
    redisUrl: string,
    password?: string,
    port?: string
  ): Promise<RedisClient> => {
    const redisPort: number = parseInt(port || DEFAULT_REDIS_PORT, 10);
    const redisClientConnection = redis.createCluster<
      redis.RedisDefaultModules,
      Record<string, never>,
      Record<string, never>
    >({
      defaults: {
        legacyMode: true,
        password
      },
      rootNodes: [
        {
          url: `redis://${redisUrl}:${redisPort}`
        }
      ],
      useReplicas: true
    });
    await redisClientConnection.connect();
    return redisClientConnection;
  };
}
