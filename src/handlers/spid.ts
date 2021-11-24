import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { IPString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { format as dateFnsFormat } from "date-fns";
import * as express from "express";
import { isLeft, tryCatch2v } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
import { Task } from "fp-ts/lib/Task";
import { DOMParser } from "xmldom";
import { SpidLogMsg } from "../types/access_log";
import {
  getFiscalNumberFromPayload,
  getRequestIDFromResponse,
  storeSpidLogs
} from "../utils/access_log";
import { logger } from "../utils/logger";
export const successHandler = (req: express.Request, res: express.Response) =>
  res.json({
    success: "success",
    token: req.query.token
  });

export const errorHandler = (_: express.Request, res: express.Response) =>
  res
    .json({
      error: "error"
    })
    .status(400);

export const metadataRefreshHandler = (
  idpMetadataRefresher: () => Task<void>
) => async (_: express.Request, res: express.Response) => {
  await idpMetadataRefresher().run();
  res.json({
    metadataUpdate: "completed"
  });
};

export const accessLogHandler = (
  blobService: BlobService,
  containerName: NonEmptyString,
  spidLogsPublicKey: NonEmptyString
) => (
  sourceIp: string | null,
  requestPayload: string,
  responsePayload: string
): void => {
  const logPrefix = `SpidLogCallback`;
  tryCatch2v(
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

      if (isLeft(errorOrSpidMsg)) {
        logger.error(`${logPrefix}|ERROR=Invalid format for SPID log payload`);
        logger.debug(
          `${logPrefix}|ERROR_DETAILS=${readableReport(errorOrSpidMsg.value)}`
        );
        return;
      }
      const spidMsg = errorOrSpidMsg.value;

      // We store Spid logs in a fire&forget pattern
      await storeSpidLogs(
        blobService,
        containerName,
        spidLogsPublicKey,
        spidMsg
      )
        .mapLeft(err => {
          logger.error(`${logPrefix}|ERROR=Cannot store SPID log`);
          logger.debug(`${logPrefix}|ERROR_DETAILS=${err}`);
        })
        .run();
    },
    err => {
      logger.error(`${logPrefix}|ERROR=${err}`);
    }
  );
};
