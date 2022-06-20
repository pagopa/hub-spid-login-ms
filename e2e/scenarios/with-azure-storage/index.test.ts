import { createBlobService } from "azure-storage";
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
const storage = createBlobService(spidLogStorage.connectionString);

jest.setTimeout(1e6);

beforeAll(async () => {
  // somehow we need to wait idp metadata are loaded
  await delay(startupTime);
});
describe("With Azure Storage", () => {
  beforeEach(async () => {
    // the app expects container to exist already
    await new Promise((resolve, reject) =>
      storage.createContainerIfNotExists(
        spidLogStorage.containerName,
        (err, res) => (err ? reject(err) : resolve(res))
      )
    );
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
        storage.listBlobsSegmented(
          spidLogStorage.containerName,
          // @ts-ignore
          null,
          (err, res) => (err ? reject(err) : resolve(res))
        )
      );
      const [, , fiscalNumber] = testCredentials;
      // shape = { entries: [{name, ...other}], ...other}
      expect(blobs).toEqual(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining(`${fiscalNumber}.json`),
            }),
          ]),
        })
      );
    }
  });
});
