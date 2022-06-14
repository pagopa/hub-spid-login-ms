import { delay, bigTime, littleTime } from "../../utils/misc";
import { host, showBrowser, testEntityID, testCredentials } from "./config";

const puppeteer = require("puppeteer");

jest.setTimeout(1e6);

beforeAll(async () => {
  // somehow we need to wait idp metadata are loaded
  await delay(bigTime * 4);
});
describe("Basic", () => {
  it("should login with an existing user", async () => {
    const { url } = await withBrowser(async (browser) => {
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
        return { url };
      }
    });

    // if login is ok, we landed into success page
    expect(url).toEqual(expect.stringContaining("/success"));
  });
});

// ensure browser is disposed
const withBrowser = async <T>(
  fn: (browser: any /* fixme: use proper type */) => Promise<T>
): Promise<T> => {
  const browser = await puppeteer.launch({
    headless: !showBrowser,
    ignoreHTTPSErrors: true,
  });

  try {
    const result = await fn(browser);
    await browser.close();
    return result;
  } catch (error) {
    console.error("Error executing puppeteer script: ", error);
    throw error;
  }
};

// page.click() does not work if the element isn't shown on page (maybe isn't above the fold)
// this solves the problem by using DOM's native click() method
const clickAnyway = (page: any /* fixme: use proper type */) => (
  selector: string
): Promise<void> =>
  page.evaluate((selector: string) => {
    console.log("eee", selector, document.querySelector(selector));
    debugger;
    // @ts-ignore because TS doesn't know it's a button
    const el = document.querySelector(selector) as any;
    if ("click" in el && typeof el.click === "function") {
      return el.click();
    } else {
      throw new Error(
        `click() is not defined for the selected element. Selector: ${selector}`
      );
    }
  }, selector);
