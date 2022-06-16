import {
  ApplicationInsightsConfig,
  initAppInsights as startAppInsights
} from "@pagopa/ts-commons/lib/appinsights";
import * as appInsights from "applicationinsights";

/**
 * App Insights is initialized to collect the following informations:
 * - Incoming API calls
 * - Server performance information (CPU, RAM)
 * - Unandled Runtime Exceptions
 * - Outcoming API Calls (dependencies)
 * - Realtime API metrics
 */
export const initAppInsights = (
  instrumentationKey: string,
  config: ApplicationInsightsConfig = {}
): appInsights.TelemetryClient => {
  startAppInsights(instrumentationKey, config);
  return appInsights.defaultClient;
};
