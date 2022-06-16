import {
  delay,
  bigTime,
  littleTime,
  withBrowser,
  clickAnyway,
} from "../../utils/misc";
import { host, showBrowser, testEntityID, testCredentials } from "./config";

const puppeteer = require("puppeteer");

jest.setTimeout(1e6);

beforeAll(async () => {
  // somehow we need to wait idp metadata are loaded
  await delay(bigTime * 5);
});
describe("Basic", () => {
  it("should login with an existing user", () =>
    withBrowser(
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
    }));
});
