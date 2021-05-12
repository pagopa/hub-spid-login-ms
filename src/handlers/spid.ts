import * as express from "express";
import { Task } from "fp-ts/lib/Task";
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
