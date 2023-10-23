import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  ListBucketsCommandOutput,
  ListObjectsCommand,
  S3Client
} from "@aws-sdk/client-s3";
import {
  delay,
  bigTime,
  littleTime,
  withBrowser,
  clickAnyway,
  startupTime
} from "../../utils/misc";
import {
  host,
  showBrowser,
  testEntityID,
  testCredentials,
  spidLogStorage
} from "./config";
import fetch from "node-fetch";

const puppeteer = require("puppeteer");

const { accessKeyId, secretAccessKey, endpoint, region } = spidLogStorage;

const storage = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  },
  forcePathStyle: true
});

jest.setTimeout(1e6);

// Ensure a bucket exists and it's empty
const resetS3Bucket = async (storage: S3Client, Bucket: string) => {
  const allBuckets = await new Promise<ListBucketsCommandOutput>(
    (resolve, reject) =>
      storage.send(new ListBucketsCommand({ Bucket }), (err, res) =>
        err ? reject(err) : resolve(res!)
      )
  );

  if (allBuckets.Buckets?.find(({ Name }) => Name === Bucket)) {
    const allObjects = await new Promise<ListBucketsCommandOutput>(
      (resolve, reject) =>
        storage.send(new ListBucketsCommand({}), (err, res) =>
          err ? reject(err) : resolve(res!)
        )
    );

    await Promise.allSettled(
      allObjects.Buckets?.map(c => c.Name)
        .filter((k): k is string => typeof k === "string")
        .map(
          Key =>
            new Promise((resolve, reject) =>
              storage.send(new DeleteBucketCommand({ Bucket }), (err, res) =>
                err ? reject(err) : resolve(res)
              )
            )
        ) || []
    );
  } else {
    await new Promise((resolve, reject) =>
      storage.send(new CreateBucketCommand({ Bucket }), (err, res) =>
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
    )(async browser => {
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

    /* query storage and expect a blob for the current user */
    const blobs = await new Promise((resolve, reject) =>
      storage.send(
        new ListObjectsCommand({ Bucket: spidLogStorage.containerName }),
        (err, res) => (err ? reject(err) : resolve(res))
      )
    );

    const [, , fiscalNumber] = testCredentials;
    // shape = { entries: [{name, ...other}], ...other}

    expect(blobs).toEqual(
      expect.objectContaining({
        Contents: expect.arrayContaining([
          expect.objectContaining({
            Key: expect.stringContaining(`${fiscalNumber}.json`)
          })
        ])
      })
    );
  });
  it("healthcheck should return a success", async () => {
    const result = await fetch(`${host}/healthcheck`)
      .then(res => res.json())
      .catch(err => new Error(err));

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toStrictEqual("OK");
  });
});
