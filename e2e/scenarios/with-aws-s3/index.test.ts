import * as aws from "aws-sdk";
import {
  delay,
  bigTime,
  littleTime,
  withBrowser,
  clickAnyway,
  startupTime,
} from "../../utils/misc";
import {
  host,
  showBrowser,
  testEntityID,
  testCredentials,
  spidLogStorage,
} from "./config";

const puppeteer = require("puppeteer");

const { accessKeyId, secretAccessKey, endpoint } = spidLogStorage;

const storage = new aws.S3({
  accessKeyId,
  secretAccessKey,
  endpoint,
  s3ForcePathStyle: true, // needed with minio?
  signatureVersion: "v4",
});

jest.setTimeout(1e6);

// Ensure a bucket exists and it's empty
const resetS3Bucket = async (storage: aws.S3, Bucket: string) => {
  const allBuckets = await new Promise<aws.S3.ListBucketsOutput>(
    (resolve, reject) =>
      storage.listBuckets((err, res) => (err ? reject(err) : resolve(res)))
  );

  if (allBuckets.Buckets?.find(({ Name }) => Name === Bucket)) {
    const allObjects = await new Promise<aws.S3.ListObjectsOutput>(
      (resolve, reject) =>
        storage.listObjects({ Bucket }, (err, res) =>
          err ? reject(err) : resolve(res)
        )
    );

    await Promise.allSettled(
      allObjects.Contents?.map((c) => c.Key)
        .filter((k): k is string => typeof k === "string")
        .map(
          (Key) =>
            new Promise((resolve, reject) =>
              storage.deleteObject({ Bucket, Key }, (err, res) =>
                err ? reject(err) : resolve(res)
              )
            )
        ) || []
    );
  } else {
    await new Promise((resolve, reject) =>
      storage.createBucket({ Bucket }, (err, res) =>
        err ? reject(err) : resolve(res)
      )
    );
  }
};

beforeAll(async () => {
  // somehow we need to wait idp metadata are loaded
  await delay(startupTime);
});
describe("With AWS S3", () => {
  beforeEach(async () => {
    // the app expects container to exist already
    await resetS3Bucket(storage, spidLogStorage.containerName);
  });

  it("should log spid assertion after login", async () => {
    await withBrowser(
      puppeteer,
      showBrowser
    )(async (browser) => {
      const page = await browser.newPage();

      /* open login page */ {
        await page.goto(
          `${host}/login?entityID=${testEntityID}&authLevel=SpidL2`
        );
        await delay(bigTime);
      }

      /* submit login form with test credentials */ {
        await page.evaluate(([username, password]: typeof testCredentials) => {
          // @ts-ignore
          document.getElementById("username").value = username;
          // @ts-ignore
          document.getElementById("password").value = password;
        }, testCredentials);

        await clickAnyway(page)("form[name='formLogin'] [type='submit']");
        await delay(littleTime);
      }

      /* confirm data access (SPID mandatory step) */ {
        await clickAnyway(page)("form[name='formConfirm'] [type='submit']");
        await delay(littleTime);
      }

      /* read landing url and return data to the test */ {
        await delay(littleTime);
        const url = await page.url();

        // if login is ok, we landed into success page
        expect(url).toEqual(expect.stringContaining("/success"));
      }
    });

    /* query storage and expect a blob for the current user */ {
      const blobs = await new Promise((resolve, reject) =>
        storage.listObjects(
          { Bucket: spidLogStorage.containerName },
          (err, res) => (err ? reject(err) : resolve(res))
        )
      );
      const [, , fiscalNumber] = testCredentials;
      // shape = { entries: [{name, ...other}], ...other}
      expect(blobs).toEqual(
        expect.objectContaining({
          Contents: expect.arrayContaining([
            expect.objectContaining({
              Key: expect.stringContaining(`${fiscalNumber}.json`),
            }),
          ]),
        })
      );
    }
  });
});
