/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import {
  IntegerFromString,
  NonNegativeInteger,
  NumberFromString
} from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { pipe, flow, identity } from "fp-ts/lib/function";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { withDefault } from "@pagopa/ts-commons/lib/types";
import { UrlFromString } from "@pagopa/ts-commons/lib/url";

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

export const ContactPersonParams = t.intersection([
  t.interface({
    COMPANY_EMAIL: EmailString,
    COMPANY_FISCAL_CODE: OrganizationFiscalCode,
    COMPANY_IPA_CODE: NonEmptyString,
    COMPANY_NAME: NonEmptyString,
    COMPANY_VAT_NUMBER: NonEmptyString
  }),
  t.partial({
    COMPANY_PHONE_NUMBER: NonEmptyString
  })
]);
export type ContactPersonParams = t.TypeOf<typeof ContactPersonParams>;

const SpidLogsStorageAzureStorage = t.interface({
  SPID_LOGS_STORAGE_CONNECTION_STRING: NonEmptyString,
  SPID_LOGS_STORAGE_CONTAINER_NAME: NonEmptyString,
  SPID_LOGS_STORAGE_KIND: withDefault(
    t.literal("azurestorage"),
    // for backward compatibility, we assume no kind means azure storage
    "azurestorage"
  )
});

/**
 * This is a workaround for UrlFromString which seems to be buggy:
 *   optional attributes are supposed to be omitted if they are not found in the original URL string
 *   instead, a null value is passed
 * This codec is meant to be piped to UrlFromString
 *
 * @example UrlFromString.pipe(UrlFromStringWithoutNulls)
 */
export const UrlFromStringWithoutNulls = new t.Type<
  UrlFromString & {
    readonly port?: string;
    readonly query?: string | Record<string, string | ReadonlyArray<string>>;
  },
  UrlFromString,
  UrlFromString
>(
  "UrlFromStringWithoutNulls",
  (
    e
  ): e is UrlFromString & {
    readonly port?: string;
    readonly query?: string | Record<string, string | ReadonlyArray<string>>;
  } =>
    typeof e === "object" &&
    e !== null &&
    // eslint-disable-next-line @typescript-eslint/dot-notation
    e["query"] !== null &&
    UrlFromString.is(e),
  // explicitly remove optional fields during parse if they are null
  ({ port, query, ...e }) =>
    t.success({
      ...e,
      ...(query === null ? {} : { query }),
      ...(port === null ? {} : { port })
    }),
  identity
);

// Refine UrlFromString codec to map Endpoint type in @aws-sdk/types/dist-types/http.d.ts
export const AWSEndpoint = UrlFromString.pipe(UrlFromStringWithoutNulls).pipe(
  t.intersection([
    t.interface({
      hostname: NonEmptyString,
      href: NonEmptyString,
      path: NonEmptyString,
      protocol: NonEmptyString
    }),
    t.partial({
      port: NumberFromString,
      query: t.record(t.string, t.union([t.string, t.array(t.string)]))
    })
  ])
);

const SpidLogsStorageAwsS3 = t.intersection([
  t.interface({
    SPID_LOGS_STORAGE_CONNECTION_TIMEOUT: withDefault(t.string, "60000").pipe(
      NumberFromString
    ),
    SPID_LOGS_STORAGE_CONTAINER_NAME: NonEmptyString,
    SPID_LOGS_STORAGE_KIND: t.literal("awss3")
  }),
  t.partial({
    SPID_LOGS_STORAGE_CONTAINER_REGION: NonEmptyString,
    SPID_LOGS_STORAGE_ENDPOINT: AWSEndpoint,
    SPID_LOGS_STORAGE_NAME_HIDE_FISCALCODE: t.boolean
  })
]);

export type SpidLogsStorageConfiguration = t.TypeOf<
  typeof SpidLogsStorageConfiguration
>;
export const SpidLogsStorageConfiguration = t.union([
  SpidLogsStorageAzureStorage,
  SpidLogsStorageAwsS3
]);

const SpidLogsParams = t.union([
  // When Logs are enabled, storage configuration is mandatory
  t.intersection([
    t.interface({
      ENABLE_SPID_ACCESS_LOGS: t.literal(true),
      SPID_LOGS_PUBLIC_KEY: NonEmptyString
    }),
    SpidLogsStorageConfiguration
  ]),
  t.interface({
    ENABLE_SPID_ACCESS_LOGS: t.literal(false)
  })
]);
type SpidLogsParams = t.TypeOf<typeof SpidLogsParams>;

export const CommonSpidParams = t.intersection([
  t.interface({
    ACS_BASE_URL: NonEmptyString,
    ALLOW_CORS: t.boolean,
    AUTH_N_CONTEXT: NonEmptyString,

    ENDPOINT_ACS: NonEmptyString,
    ENDPOINT_ERROR: NonEmptyString,
    ENDPOINT_LOGIN: NonEmptyString,
    ENDPOINT_LOGOUT: NonEmptyString,
    ENDPOINT_METADATA: NonEmptyString,
    ENDPOINT_SUCCESS: NonEmptyString,
    IDP_METADATA_URL: NonEmptyString,
    INCLUDE_SPID_USER_ON_INTROSPECTION: t.boolean,
    METADATA_PRIVATE_CERT: NonEmptyString,
    METADATA_PUBLIC_CERT: NonEmptyString,
    ORG_DISPLAY_NAME: NonEmptyString,
    ORG_ISSUER: NonEmptyString,

    ORG_NAME: NonEmptyString,
    ORG_URL: NonEmptyString,
    REQUIRED_ATTRIBUTES_SERVICE_NAME: NonEmptyString,
    SPID_ATTRIBUTES: NonEmptyString
  }),
  t.partial({
    SPID_TESTENV_URL: NonEmptyString,
    SPID_VALIDATOR_URL: NonEmptyString
  }),
  SpidLogsParams
]);

export type CommonSpidParams = t.TypeOf<typeof CommonSpidParams>;

export const SpidParams = t.union([
  t.intersection([
    t.interface({
      ENABLE_FULL_OPERATOR_METADATA: t.literal(false)
    }),
    CommonSpidParams
  ]),
  t.intersection([
    t.interface({
      ENABLE_FULL_OPERATOR_METADATA: t.literal(true)
    }),
    CommonSpidParams,
    ContactPersonParams
  ])
]);
export type SpidParams = t.TypeOf<typeof SpidParams>;

export const UserRegistryParams = t.union([
  t.interface({
    ENABLE_USER_REGISTRY: t.literal(true),
    USER_REGISTRY_API_KEY: NonEmptyString,
    USER_REGISTRY_URL: NonEmptyString
  }),
  t.interface({
    ENABLE_USER_REGISTRY: t.literal(false)
  })
]);

export type UserRegistryParams = t.TypeOf<typeof UserRegistryParams>;

export const JWTParams = t.union([
  t.intersection([
    t.interface({
      ENABLE_JWT: t.literal(true),
      JWT_TOKEN_ISSUER: NonEmptyString,
      JWT_TOKEN_PRIVATE_KEY: NonEmptyString
    }),
    t.partial({
      JWT_TOKEN_AUDIENCE: NonEmptyString,
      JWT_TOKEN_KID: NonEmptyString
    }),
    UserRegistryParams
  ]),
  t.interface({
    ENABLE_JWT: t.literal(false),
    ENABLE_USER_REGISTRY: t.literal(false)
  })
]);
export type JWTParams = t.TypeOf<typeof JWTParams>;

export const CIEParams = t.interface({
  CIE_URL: NonEmptyString
});

export type CIEParams = t.TypeOf<typeof CIEParams>;

const AttributeAuthorityParams = t.union([
  t.interface({
    ADE_AA_API_ENDPOINT: NonEmptyString,
    ENABLE_ADE_AA: t.literal(true),
    ENDPOINT_L1_SUCCESS: NonEmptyString,
    L1_TOKEN_EXPIRATION: NonNegativeInteger,
    L1_TOKEN_HEADER_NAME: NonEmptyString,
    L2_TOKEN_EXPIRATION: NonNegativeInteger
  }),
  t.interface({
    ENABLE_ADE_AA: t.literal(false),
    TOKEN_EXPIRATION: NonNegativeInteger
  })
]);
type AttributeAuthorityParams = t.TypeOf<typeof AttributeAuthorityParams>;

// Authentication app configuration
export type IConfigAuth = t.TypeOf<typeof IConfigAuth>;
export const IConfigAuth = t.intersection([
  AttributeAuthorityParams,
  CIEParams,
  JWTParams,
  SpidParams
]);

export type IConfigUtility = t.TypeOf<typeof IConfigUtility>;
export const IConfigUtility = t.intersection([
  t.interface({
    APPINSIGHTS_DISABLED: t.boolean,
    APPINSIGHTS_INSTRUMENTATIONKEY: NonEmptyString,
    SERVER_PORT: NonNegativeInteger,
    isProduction: t.boolean
  }),
  RedisParams
]);

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([IConfigAuth, IConfigUtility]);

const DEFAULT_SERVER_PORT = 8080;

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode({
  ...process.env,
  ALLOW_CORS: pipe(
    O.fromNullable(process.env.ALLOW_CORS),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  APPINSIGHTS_DISABLED: pipe(
    O.fromNullable(process.env.APPINSIGHTS_DISABLED),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => true)
  ),
  CIE_URL: pipe(
    O.fromNullable(process.env.CIE_URL),
    O.getOrElse(
      () =>
        "https://preproduzione.idserver.servizicie.interno.gov.it/idp/shibboleth?Metadata"
    )
  ),
  ENABLE_ADE_AA: pipe(
    O.fromNullable(process.env.ENABLE_ADE_AA),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  ENABLE_FULL_OPERATOR_METADATA: pipe(
    O.fromNullable(process.env.ENABLE_FULL_OPERATOR_METADATA),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  ENABLE_JWT: pipe(
    O.fromNullable(process.env.ENABLE_JWT),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  ENABLE_SPID_ACCESS_LOGS: pipe(
    O.fromNullable(process.env.ENABLE_SPID_ACCESS_LOGS),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  ENABLE_USER_REGISTRY: pipe(
    O.fromNullable(process.env.ENABLE_USER_REGISTRY),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  IDP_METADATA_URL: pipe(
    O.fromNullable(process.env.IDP_METADATA_URL),
    O.getOrElse(
      () => "https://registry.spid.gov.it/metadata/idp/spid-entities-idps.xml"
    )
  ),
  INCLUDE_SPID_USER_ON_INTROSPECTION: pipe(
    O.fromNullable(process.env.INCLUDE_SPID_USER_ON_INTROSPECTION),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  L1_TOKEN_EXPIRATION: pipe(
    process.env.L1_TOKEN_EXPIRATION,
    IntegerFromString.decode,
    E.getOrElseW(_ => undefined)
  ),
  L2_TOKEN_EXPIRATION: pipe(
    process.env.L2_TOKEN_EXPIRATION,
    IntegerFromString.decode,
    E.getOrElseW(_ => undefined)
  ),
  REDIS_CLUSTER_ENABLED: pipe(
    O.fromNullable(process.env.REDIS_CLUSTER_ENABLED),
    O.map(_ => _.toLowerCase() === "true"),
    O.toUndefined
  ),
  REDIS_TLS_ENABLED: pipe(
    O.fromNullable(process.env.REDIS_TLS_ENABLED),
    O.map(_ => _.toLowerCase() === "true"),
    O.toUndefined
  ),
  SERVER_PORT: pipe(
    // FIXME: if env var is empty string, the result of the pipe would be 0.
    //  Should we consider empty string same as nullable input?
    E.fromNullable(DEFAULT_SERVER_PORT)(process.env.SERVER_PORT),
    E.chain(
      flow(
        IntegerFromString.decode,
        E.mapLeft(() => DEFAULT_SERVER_PORT)
      )
    ),
    E.toUnion
  ),
  SPID_LOGS_STORAGE_NAME_HIDE_FISCALCODE: pipe(
    O.fromNullable(process.env.SPID_LOGS_STORAGE_NAME_HIDE_FISCALCODE),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  TOKEN_EXPIRATION: pipe(
    // FIXME: if env var is empty string, the result of the pipe would be 0.
    //  Should we consider empty string same as nullable input?
    E.fromNullable(-1)(process.env.TOKEN_EXPIRATION),
    E.chain(
      flow(
        IntegerFromString.decode,
        E.mapLeft(() => -1)
      )
    ),
    E.fold(() => 3600, identity)
  ),
  isProduction: process.env.NODE_ENV === "prod"
});

/**
 * Read the application configuration and check for invalid values.
 * Configuration is eagerly evalued when the application starts.
 *
 * @returns either the configuration values or a list of validation errors
 */
export const getConfig = (): t.Validation<IConfig> => errorOrConfig;

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */
export const getConfigOrThrow = (): IConfig =>
  pipe(
    errorOrConfig,
    E.getOrElseW(errors => {
      throw new Error(`Invalid configuration: ${readableReport(errors)}`);
    })
  );
