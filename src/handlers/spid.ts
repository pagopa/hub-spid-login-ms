import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { IPString } from "@pagopa/ts-commons/lib/strings";
import { format as dateFnsFormat } from "date-fns";
import * as express from "express";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { isNone } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { Task } from "fp-ts/lib/Task";
import { DOMParser } from "xmldom";
import { IConfig } from "src/utils/config";
import * as t from "io-ts";
import * as O from "fp-ts/lib/Option";
import { safeXMLParseFromString } from "@pagopa/io-spid-commons/dist/utils/samlUtils";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import { ResponsePermanentRedirect } from "@pagopa/ts-commons/lib/responses";
import { AssertionConsumerServiceT } from "@pagopa/io-spid-commons";
import * as redis from "redis";
import { SpidLogMsg } from "../types/access_log";
import {
  AccessLogWriter,
  getFiscalNumberFromPayload,
  getRequestIDFromResponse,
  AccessLogEncrypter,
  MakeSpidLogBlobName
} from "../utils/access_log";
import { logger } from "../utils/logger";
import { getSpidLevelFromSAMLResponse, SpidLevelEnum } from "../utils/spid";
import { blurUser } from "../utils/user_registry";
import { PersonalDatavaultAPIClient } from "../clients/pdv_client";
import {
  errorsToError,
  toCommonTokenUser,
  toRequestId,
  toResponseErrorInternal,
  toTokenUserL2
} from "../utils/conversions";
import { AdeAPIClient } from "../clients/ade";
import { SpidUser, TokenUser, TokenUserL2 } from "../types/user";
import { getUserCompanies } from "../utils/attribute_authority";
import { CertificationEnum } from "../../generated/pdv-userregistry-api/CertifiableFieldResourceOfLocalDate";
import { getGenerateToken } from "./token";

export const successHandler = (
  req: express.Request,
  res: express.Response
): express.Response =>
  res.json({
    success: "success",
    token: req.query.token
  });

export const errorHandler = (
  _: express.Request,
  res: express.Response
): express.Response =>
  res
    .json({
      error: "error"
    })
    .status(400);

export const metadataRefreshHandler = (
  idpMetadataRefresher: () => Task<void>
) => async (_: express.Request, res: express.Response): Promise<void> => {
  await idpMetadataRefresher()();
  res.json({
    metadataUpdate: "completed"
  });
};

export const accessLogHandler = (
  logWriter: AccessLogWriter,
  logEncrypter: AccessLogEncrypter,
  makeSpidLogBlobName: MakeSpidLogBlobName
) => (
  sourceIp: string | null,
  requestPayload: string,
  responsePayload: string
): void => {
  const logPrefix = `SpidLogCallback`;
  E.tryCatch(
    async () => {
      const responseXML = new DOMParser().parseFromString(
        responsePayload,
        "text/xml"
      );
      if (!responseXML) {
        logger.error(`${logPrefix}|ERROR=Cannot parse SPID XML`);
        return;
      }

      const maybeRequestId = getRequestIDFromResponse(responseXML);
      if (isNone(maybeRequestId)) {
        logger.error(`${logPrefix}|ERROR=Cannot get Request ID from SPID XML`);
        return;
      }
      const requestId = maybeRequestId.value;

      const maybeFiscalCode = getFiscalNumberFromPayload(responseXML);
      if (isNone(maybeFiscalCode)) {
        logger.error(
          `${logPrefix}|ERROR=Cannot get user's fiscal Code from SPID XML`
        );
        return;
      }
      const fiscalCode = maybeFiscalCode.value;

      const errorOrSpidMsg = SpidLogMsg.decode({
        createdAt: new Date(),
        createdAtDay: dateFnsFormat(new Date(), "YYYY-MM-DD"),
        fiscalCode,
        ip: sourceIp as IPString,
        requestPayload,
        responsePayload,
        spidRequestId: requestId
      } as SpidLogMsg);

      if (E.isLeft(errorOrSpidMsg)) {
        logger.error(`${logPrefix}|ERROR=Invalid format for SPID log payload`);
        logger.debug(
          `${logPrefix}|ERROR_DETAILS=${readableReport(errorOrSpidMsg.left)}`
        );
        return;
      }
      const spidMsg = errorOrSpidMsg.right;

      // We store Spid logs in a fire&forget pattern
      await pipe(
        logEncrypter(spidMsg),
        TE.fromEither,
        TE.chain(item => logWriter(item, makeSpidLogBlobName(spidMsg))),
        TE.mapLeft(err => {
          logger.error(`${logPrefix}|ERROR=Cannot store SPID log`);
          logger.debug(`${logPrefix}|ERROR_DETAILS=${err}`);
        })
      )();
    },
    err => {
      logger.error(`${logPrefix}|ERROR=${err}`);
    }
  );
};

export const getAcs: (
  config: IConfig,
  redisClient: redis.RedisClientType | redis.RedisClusterType
) => // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
AssertionConsumerServiceT<never> = (config, redisClient) => async user =>
  pipe(
    user,
    SpidUser.decode,
    E.mapLeft(errs => toResponseErrorInternal(errorsToError(errs))),
    // binds the Spid level to the SpidUser
    E.bindW("authnContextClassRef", spidUser =>
      pipe(
        spidUser.getAssertionXml(),
        t.string.decode,
        E.chainW(assertion =>
          pipe(
            assertion,
            safeXMLParseFromString,
            O.chain(getSpidLevelFromSAMLResponse),
            E.fromOption(() => new Error("Spid level retrieval failed"))
          )
        ),
        E.getOrElse(() => SpidLevelEnum["https://www.spid.gov.it/SpidL1"]),
        E.of
      )
    ),
    E.chain(spidUser => {
      logger.info("ACS | Trying to map user to Common User");
      return pipe(
        spidUser,
        toCommonTokenUser,
        E.mapLeft(toResponseErrorInternal)
      );
    }),
    TE.fromEither,
    TE.chain(commonUser => {
      logger.info(
        "ACS | Trying to retreive UserCompanies or map over a default user"
      );
      return config.ENABLE_ADE_AA
        ? pipe(
            getUserCompanies(
              AdeAPIClient(config.ADE_AA_API_ENDPOINT),
              commonUser.fiscal_number
            ),
            TE.map(companies => ({
              ...commonUser,
              companies,
              from_aa: config.ENABLE_ADE_AA as boolean
            }))
          )
        : TE.of({
            ...commonUser,
            from_aa: config.ENABLE_ADE_AA as boolean
          });
    }),
    TE.chainW(commonUser => {
      logger.info(
        `ACS | Personal Data Vault - Check for User: ${config.ENABLE_USER_REGISTRY}`
      );
      return config.ENABLE_USER_REGISTRY
        ? pipe(
            blurUser(
              PersonalDatavaultAPIClient(config.USER_REGISTRY_URL),
              withoutUndefinedValues({
                fiscalCode: commonUser.fiscal_number,
                ...(commonUser.email && {
                  email: {
                    certification: CertificationEnum.SPID,
                    value: commonUser.email
                  }
                }),
                ...(commonUser.family_name && {
                  familyName: {
                    certification: CertificationEnum.SPID,
                    value: commonUser.family_name
                  }
                }),
                ...(commonUser.name && {
                  name: {
                    certification: CertificationEnum.SPID,
                    value: commonUser.name
                  }
                })
              }),
              config.USER_REGISTRY_API_KEY
            ),
            TE.map(uuid => ({
              ...commonUser,
              uid: uuid.id
            }))
          )
        : TE.of({ ...commonUser });
    }),
    TE.chainW(commonUser => {
      logger.info("ACS | Trying to decode TokenUser");
      return pipe(
        commonUser,
        TokenUser.decode,
        TE.fromEither,
        TE.mapLeft(errs => toResponseErrorInternal(errorsToError(errs)))
      );
    }),
    // If User is related to one company we can directly release an L2 token
    TE.chainW(tokenUser => {
      logger.info("ACS | Companies length decision making");
      return tokenUser.from_aa
        ? tokenUser.companies.length === 1
          ? pipe(
              toTokenUserL2(tokenUser, tokenUser.companies[0]),
              TE.fromEither,
              TE.mapLeft(toResponseErrorInternal)
            )
          : TE.of(tokenUser as TokenUser | TokenUserL2)
        : pipe(
            TokenUserL2.decode({ ...tokenUser, level: "L2" }),
            TE.fromEither,
            TE.mapLeft(errs => toResponseErrorInternal(errorsToError(errs)))
          );
    }),
    TE.chainW(tokenUser => {
      logger.info("ACS | Generating token");
      const requestId =
        config.ENABLE_JWT && config.JWT_TOKEN_JTI_SPID
          ? toRequestId(user as Record<string, unknown>)
          : undefined;
      return pipe(
        getGenerateToken(config, redisClient)(tokenUser, requestId),
        TE.mapLeft(toResponseErrorInternal)
      );
    }),
    TE.mapLeft(error => {
      logger.info(
        `ACS | Assertion Consumer Service ERROR|${error.kind} ${JSON.stringify(
          error.detail
        )}`
      );
      logger.error(
        `Assertion Consumer Service ERROR|${error.kind} ${JSON.stringify(
          error.detail
        )}`
      );
      return error;
    }),
    TE.map(({ tokenStr, tokenUser }) => {
      logger.info("ACS | Redirect to success endpoint");
      return config.ENABLE_ADE_AA && !TokenUserL2.is(tokenUser)
        ? ResponsePermanentRedirect(({
            href: `${config.ENDPOINT_L1_SUCCESS}#token=${tokenStr}`
          } as unknown) as ValidUrl)
        : ResponsePermanentRedirect(({
            href: `${config.ENDPOINT_SUCCESS}#token=${tokenStr}`
          } as unknown) as ValidUrl);
    }),
    TE.toUnion
  )();
