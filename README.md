# Liftaven for n8n

Build workflows with the [Liftaven](https://liftaven.com) REST API. This community node sends ordinary HTTP resource requests and returns JSON responses. It does not connect to an MCP server or use JSON-RPC.

## Installation

Install `n8n-nodes-liftaven` from **Settings → Community nodes** in your n8n instance. You can also install the npm package in a self-hosted n8n installation.

## Authentication

Create the **Liftaven OAuth2 API** credential, select **Connect my account**, sign in to Liftaven, and approve the listed permissions. Credentials use dynamic registration, OAuth authorization code flow, PKCE, expiring access tokens, and refresh tokens. The API resource is `https://mcp.liftaven.com/v1`; REST tokens are separate from MCP tokens.

**Upgrading from 1.x:** reconnect the credential before running workflows. Version 2 replaces the old MCP transport with the native REST API. Inputs retain their names, while outputs are the API's resource JSON. Review existing workflows before enabling writes.

## Operations

| Operation | HTTP request |
| --- | --- |
| Get Bing crawl statistics | `GET /v1/bing/crawl` |
| Get Bing page performance | `GET /v1/bing/pages` |
| Get Bing query performance | `GET /v1/bing/queries` |
| Get Bing search traffic | `GET /v1/bing/traffic` |
| List Bing sitemaps | `GET /v1/bing/sitemaps` |
| List Bing Webmaster sites | `GET /v1/bing/sites` |
| Submit a sitemap to Bing | `POST /v1/bing/sitemaps` |
| Check connected providers | `GET /v1/connections` |
| Run related reports together | `POST /v1/analytics/properties/:propertyId/batch-reports` |
| Check report compatibility | `POST /v1/analytics/properties/:propertyId/compatibility` |
| Get data retention | `GET /v1/analytics/properties/:propertyId/data-retention` |
| Discover report fields | `GET /v1/analytics/properties/:propertyId/metadata` |
| Get property settings | `GET /v1/analytics/properties/:propertyId` |
| Read SEO performance | `POST /v1/analytics/properties/:propertyId/seo-reports` |
| List Analytics accounts | `GET /v1/analytics/accounts` |
| List custom dimensions | `GET /v1/analytics/properties/:propertyId/custom-dimensions` |
| List custom metrics | `GET /v1/analytics/properties/:propertyId/custom-metrics` |
| List tracking streams | `GET /v1/analytics/properties/:propertyId/data-streams` |
| List configured key events | `GET /v1/analytics/properties/:propertyId/key-events` |
| Discover GA4 properties | `GET /v1/analytics/properties` |
| Check realtime activity | `POST /v1/analytics/properties/:propertyId/realtime-reports` |
| Run a GA4 report | `POST /v1/analytics/properties/:propertyId/reports` |
| Find striking-distance queries | `GET /v1/search-console/striking-distance` |
| Get Liftaven account and plan | `GET /v1/search-console/account` |
| Break traffic down by dimension | `GET /v1/search-console/breakdown` |
| Get search performance | `GET /v1/search-console/performance` |
| List Search Console properties | `GET /v1/search-console/properties` |
| List submitted sitemaps | `GET /v1/search-console/sitemaps` |
| Submit a sitemap to Google | `POST /v1/search-console/sitemaps` |
| Check website change status | `GET /v1/website-changes` |
| List connected website editors | `GET /v1/websites` |
| List website pages and files | `GET /v1/websites/:connectionId/content` |
| Prepare website change for review | `POST /v1/website-changes` |
| Read website content | `GET /v1/websites/:connectionId/content/item` |

## Workflow behavior

Each input item makes one API request and produces one linked output item. Optional pagination fields can be passed through the node's options; list responses retain their next-page cursor or offset. Write operations require the node's explicit confirmation switch. Failed requests stop the workflow unless **Continue On Fail** is enabled. HTTP errors are summarized without including credentials or raw request headers.

Requests use the fixed product API origin, encode resource identifiers, and do not follow redirects. Use a dedicated account for automation when you want separate access and data. Account ownership, workspace permissions, billing limits, and entitlement checks are enforced by the product API.

## Development and support

Run `npm ci`, `npm run lint`, and `npm test` to build and validate the package with the n8n node CLI. Source and release automation: [liftaven/n8n-nodes-liftaven](https://github.com/liftaven/n8n-nodes-liftaven). Report node issues in [GitHub Issues](https://github.com/liftaven/n8n-nodes-liftaven/issues).

Product: [Liftaven](https://liftaven.com) · [Privacy](https://liftaven.com/privacy/) · [Agent skill](https://github.com/liftaven/agent-skill) · [MCP integration](https://github.com/liftaven/mcp-server)

MIT license.
