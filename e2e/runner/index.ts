import { promises as fs } from "fs";
import { resolve as resolvePath } from "path";
import { ChildProcess, spawn } from "child_process";
export const envFlag = (e: unknown): boolean => e === "1" || e === "true";

type ProcessResult = "ok" | "ko";

const JEST_BIN_PATH = resolvePath(`${process.cwd()}/node_modules/.bin/jest`);
const JEST_CONFIG_PATH = resolvePath(`${process.cwd()}/runner/jest.config.js`);
const SCENARIOS_ROOT_PATH = resolvePath(`${process.cwd()}/scenarios`);
const DEBUG = envFlag(process.env.DEBUG);
const DRY_RUN = envFlag(process.env.DRY_RUN);

const dockerCmd = (name: string): string =>
  `docker compose --file ${SCENARIOS_ROOT_PATH}/${name}/docker-compose.yml --env-file ${SCENARIOS_ROOT_PATH}/${name}/env.scenario`;

const testCmdForScenario = (name: string): string =>
  `node ${JEST_BIN_PATH} --config ${JEST_CONFIG_PATH} --roots ${SCENARIOS_ROOT_PATH}/${name} --forceExit`;

const setupCmdForScenario = (name: string): string =>
  `${dockerCmd(name)} up ${DEBUG ? "" : "-d"}`;

const teardownCmdForScenario = (name: string): string =>
  `${dockerCmd(name)} down`;

const runProcess = (sh: string): ChildProcess => {
  if (DRY_RUN) return spawn("echo", [`DryRun for ${sh}`], { stdio: "inherit" });
  const [command, ...argv] = sh.split(" ");
  return spawn(command, argv, { stdio: "inherit" });
};

const promisifyProcess = (cp: ChildProcess): Promise<ProcessResult> =>
  new Promise(async (resolve, reject) =>
    cp
      .on("exit", code => {
        resolve(code === 0 ? "ok" : "ko");
      })
      .on("error", reject)
  );

/**
 * A scenario test is done in three steps:
 * - setup applications
 * - execute tests
 * - teardown applications
 *
 * This function handle the execution of such three steps in safe and correct order
 *
 * @param name the name of the scenario to execute test against
 * @returns either tests are ok or failed (both because of tests or because of unexpected errors)
 */
const composeScenarioTest = async (name: string): Promise<ProcessResult> => {
  try {
    await promisifyProcess(runProcess(setupCmdForScenario(name)));

    await new Promise(ok => setTimeout(ok, 5000));

    const result = await promisifyProcess(runProcess(testCmdForScenario(name)));

    await promisifyProcess(runProcess(teardownCmdForScenario(name)));

    return result;
  } catch (error) {
    console.error(
      `Unexpected error executing tests for scenario '${name}'`,
      error
    );
    return "ko";
  }
};

(async (argv: string[]) => {
  const inputScenarios = argv;

  // scenarios are defined by top-level directories in scenarios root path
  const scenarios = await fs.readdir(SCENARIOS_ROOT_PATH);

  // scenario may be filtered if are provided in input
  const selectedScenarios = inputScenarios.length
    ? scenarios.filter(e => inputScenarios.includes(e))
    : scenarios;

  // create child process for each scenario
  const runs = selectedScenarios.map(composeScenarioTest);

  // collect results from each run
  const results = await Promise.allSettled(runs);

  // merge all results into a single result
  const computedResult = results.reduce(
    (p, e) =>
      // if at least one test is failed, the whole test suite fails
      p === "ko"
        ? "ko"
        : // if any test has an unexpected error, the whole test suite fails
        e.status === "rejected"
        ? "ko"
        : // the result for the current test is passed to the computation
          e.value,
    "ok" as ProcessResult
  );

  if (computedResult === "ok") return;
  else throw new Error("at least one test scenario failed");
})(process.argv.slice(2))
  .then(_ => {
    console.log("All test scenarios succeeded");
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
