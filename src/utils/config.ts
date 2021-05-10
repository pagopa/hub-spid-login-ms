/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import {
  IntegerFromString,
  NonNegativeInteger
} from "@pagopa/ts-commons/lib/numbers";
import { fromNullable as fromNullableE } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { fromNullable } from "fp-ts/lib/Option";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

export const RedisParams = t.intersection([
  t.interface({
    REDIS_URL: NonEmptyString
  }),
  t.partial({
    REDIS_CLUSTER_ENABLED: t.boolean,
    REDIS_PASSWORD: NonEmptyString,
    REDIS_PORT: NonEmptyString,
    REDIS_TLS_ENABLED: t.boolean
  })
]);
export type RedisParams = t.TypeOf<typeof RedisParams>;

export const SpidParams = t.intersection([
  t.interface({
    AUTH_N_CONTEXT: NonEmptyString,
    ENDPOINT_ACS: NonEmptyString,
    ENDPOINT_ERROR: NonEmptyString,
    ENDPOINT_LOGIN: NonEmptyString,
    ENDPOINT_LOGOUT: NonEmptyString,
    ENDPOINT_METADATA: NonEmptyString,
    ENDPOINT_SUCCESS: NonEmptyString,
    INCLUDE_SPID_USER_ON_INTROSPECTION: t.boolean,
    METADATA_PRIVATE_CERT: NonEmptyString,
    METADATA_PUBLIC_CERT: NonEmptyString,
    ORG_DISPLAY_NAME: NonEmptyString,
    ORG_ISSUER: NonEmptyString,

    ORG_NAME: NonEmptyString,
    ORG_URL: NonEmptyString,
    SPID_ATTRIBUTES: NonEmptyString
  }),
  t.partial({
    SPID_TESTENV_URL: NonEmptyString,
    SPID_VALIDATOR_URL: NonEmptyString
  })
]);

export type SpidParams = t.TypeOf<typeof SpidParams>;

const JWTParams = t.union([
  t.interface({
    ENABLE_JWT: t.literal(true),
    JWT_TOKEN_ISSUER: NonEmptyString,
    JWT_TOKEN_PRIVATE_KEY: NonEmptyString
  }),
  t.interface({
    ENABLE_JWT: t.literal(false)
  })
]);
type JWTParams = t.TypeOf<typeof JWTParams>;

const AttributeAuthorityParams = t.union([
  t.interface({
    ENABLE_ADE_AA: t.literal(true),

    ADE_AA_API_ENDPOINT: NonEmptyString,
    ENDPOINT_L1_SUCCESS: NonEmptyString,
    L1_TOKEN_EXPIRATION: NonNegativeInteger,
    L2_TOKEN_EXPIRATION: NonNegativeInteger
  }),
  t.interface({
    ENABLE_ADE_AA: t.literal(false)
  })
]);
type AttributeAuthorityParams = t.TypeOf<typeof AttributeAuthorityParams>;

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    isProduction: t.boolean,

    APPINSIGHTS_DISABLED: t.boolean,
    APPINSIGHTS_INSTRUMENTATIONKEY: NonEmptyString,
    DEFAULT_TOKEN_EXPIRATION: NonNegativeInteger,
    SERVER_PORT: NonNegativeInteger
  }),
  RedisParams,
  SpidParams,
  JWTParams,
  AttributeAuthorityParams
]);

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode({
  ...process.env,
  APPINSIGHTS_DISABLED: fromNullable(process.env.APPINSIGHTS_DISABLED)
    .map(_ => _.toLowerCase() === "true")
    .getOrElseL(() => true),
  DEFAULT_TOKEN_EXPIRATION: fromNullableE(-1)(
    process.env.DEFAULT_TOKEN_EXPIRATION
  )
    .chain(_ => IntegerFromString.decode(_).mapLeft(() => -1))
    .fold(() => 3600, identity),
  ENABLE_ADE_AA: fromNullable(process.env.ENABLE_ADE_AA)
    .map(_ => _.toLowerCase() === "true")
    .getOrElseL(() => false),
  ENABLE_JWT: fromNullable(process.env.ENABLE_JWT)
    .map(_ => _.toLowerCase() === "true")
    .getOrElseL(() => false),
  INCLUDE_SPID_USER_ON_INTROSPECTION: fromNullable(
    process.env.INCLUDE_SPID_USER_ON_INTROSPECTION
  )
    .map(_ => _.toLowerCase() === "true")
    .getOrElseL(() => false),
  L1_TOKEN_EXPIRATION: fromNullableE(-1)(process.env.L1_TOKEN_EXPIRATION)
    .chain(_ => IntegerFromString.decode(_).mapLeft(() => -1))
    .fold(identity, identity),
  L2_TOKEN_EXPIRATION: fromNullableE(-1)(process.env.L2_TOKEN_EXPIRATION)
    .chain(_ => IntegerFromString.decode(_).mapLeft(() => -1))
    .fold(identity, identity),
  REDIS_CLUSTER_ENABLED: fromNullable(process.env.REDIS_CLUSTER_ENABLED)
    .map(_ => _.toLowerCase() === "true")
    .toUndefined(),
  REDIS_TLS_ENABLED: fromNullable(process.env.REDIS_TLS_ENABLED)
    .map(_ => _.toLowerCase() === "true")
    .toUndefined(),
  SERVER_PORT: fromNullableE(-1)(process.env.SERVER_PORT)
    .chain(_ => IntegerFromString.decode(_).mapLeft(() => -1))
    .chain(_ => NonNegativeInteger.decode(_).mapLeft(() => -1))
    .fold(() => 8080 as NonNegativeInteger, identity),
  isProduction: process.env.NODE_ENV === "prod"
});

/**
 * Read the application configuration and check for invalid values.
 * Configuration is eagerly evalued when the application starts.
 *
 * @returns either the configuration values or a list of validation errors
 */
export function getConfig(): t.Validation<IConfig> {
  return errorOrConfig;
}

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */
export function getConfigOrThrow(): IConfig {
  return errorOrConfig.getOrElseL(errors => {
    throw new Error(`Invalid configuration: ${readableReport(errors)}`);
  });
}
