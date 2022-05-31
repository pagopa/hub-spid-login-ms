import nodeFetch from "node-fetch";
import { Client, createClient } from "../../generated/ade-api/client";

export const AdeAPIClient = (
  baseUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): Client =>
  createClient({
    basePath: "",
    baseUrl,
    fetchApi
  });

export type AdeAPIClient = typeof AdeAPIClient;
