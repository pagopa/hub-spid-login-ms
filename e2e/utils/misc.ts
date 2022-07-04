export const delay = (ms: number) =>
  new Promise((done) => setTimeout(done, ms));

export const envFlag = (e: unknown): boolean => e === "1" || e === "true";

export const littleTime = 1000;
export const bigTime = 5000;
export const startupTime = 30 * 1000;

// ensure browser is disposed
export const withBrowser = (puppeteer: any, showBrowser: boolean) => async <T>(
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
export const clickAnyway = (page: any /* fixme: use proper type */) => (
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
