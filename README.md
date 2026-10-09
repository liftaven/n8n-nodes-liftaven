# Liftaven for n8n

Build workflows with the [Liftaven](https://liftaven.com) REST API. This community node sends ordinary HTTP resource requests and returns JSON responses. It does not connect to an MCP server or use JSON-RPC.

## Installation

Install `n8n-nodes-liftaven` from **Settings → Community nodes** in your n8n instance. You can also install the npm package in a self-hosted n8n installation.

## Authentication

Create the **Liftaven OAuth2 API** credential, select **Connect my account**, sign in to Liftaven, and approve the listed permissions. Credentials use dynamic registration, OAuth authorization code flow, PKCE, expiring access tokens, and refresh tokens. The API resource is `https://api.liftaven.com/v1`; REST tokens are separate from MCP tokens.

**Upgrading from 1.x or 2.x:** create a new Liftaven OAuth2 API credential and reconnect it before running workflows. Version 3 uses the product REST resource at `https://api.liftaven.com/v1` with its own OAuth audience. Tokens issued for the earlier resource cannot be reused. Inputs retain their names; review the resource JSON and write confirmations before enabling workflows.

## Resources and operations

Choose a **Resource**, then an **Operation**. Only operations and input fields for that resource are shown. Resources: Bing Webmaster Tools, Connection, Google Analytics, Google Search Console, Website, Website Change.

### Requests

| Operation                         | HTTP request                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| Get Bing crawl statistics         | `GET /v1/bing/crawl`                                         |
| Get Bing page performance         | `GET /v1/bing/pages`                                         |
| Get Bing query performance        | `GET /v1/bing/queries`                                       |
| Get Bing search traffic           | `GET /v1/bing/traffic`                                       |
| List Bing sitemaps                | `GET /v1/bing/sitemaps`                                      |
| List Bing Webmaster sites         | `GET /v1/bing/sites`                                         |
| Submit a sitemap to Bing          | `POST /v1/bing/sitemaps`                                     |
| Check connected providers         | `GET /v1/connections`                                        |
| Run related reports together      | `POST /v1/analytics/properties/:propertyId/batch-reports`    |
| Check report compatibility        | `POST /v1/analytics/properties/:propertyId/compatibility`    |
| Get data retention                | `GET /v1/analytics/properties/:propertyId/data-retention`    |
| Discover report fields            | `GET /v1/analytics/properties/:propertyId/metadata`          |
| Get property settings             | `GET /v1/analytics/properties/:propertyId`                   |
| Read SEO performance              | `POST /v1/analytics/properties/:propertyId/seo-reports`      |
| List Analytics accounts           | `GET /v1/analytics/accounts`                                 |
| List custom dimensions            | `GET /v1/analytics/properties/:propertyId/custom-dimensions` |
| List custom metrics               | `GET /v1/analytics/properties/:propertyId/custom-metrics`    |
| List tracking streams             | `GET /v1/analytics/properties/:propertyId/data-streams`      |
| List configured key events        | `GET /v1/analytics/properties/:propertyId/key-events`        |
| Discover GA4 properties           | `GET /v1/analytics/properties`                               |
| Check realtime activity           | `POST /v1/analytics/properties/:propertyId/realtime-reports` |
| Run a GA4 report                  | `POST /v1/analytics/properties/:propertyId/reports`          |
| Find striking-distance queries    | `GET /v1/search-console/striking-distance`                   |
| Get Liftaven account and plan     | `GET /v1/search-console/account`                             |
| Break traffic down by dimension   | `GET /v1/search-console/breakdown`                           |
| Get search performance            | `GET /v1/search-console/performance`                         |
| List Search Console properties    | `GET /v1/search-console/properties`                          |
| List submitted sitemaps           | `GET /v1/search-console/sitemaps`                            |
| Submit a sitemap to Google        | `POST /v1/search-console/sitemaps`                           |
| Check website change status       | `GET /v1/website-changes`                                    |
| List connected website editors    | `GET /v1/websites`                                           |
| List website pages and files      | `GET /v1/websites/:connectionId/content`                     |
| Prepare website change for review | `POST /v1/website-changes`                                   |
| Read website content              | `GET /v1/websites/:connectionId/content/item`                |

## Workflow behavior

Each input item makes one API request and produces one linked output item. Optional pagination fields can be passed through the node's options; list responses retain their next-page cursor or offset. Write operations require the node's explicit confirmation switch. Failed requests stop the workflow unless **Continue On Fail** is enabled. HTTP errors are summarized without including credentials or raw request headers.

Requests use the fixed product API origin, encode resource identifiers, and do not follow redirects. Use a dedicated account for automation when you want separate access and data. Account ownership, workspace permissions, billing limits, and entitlement checks are enforced by the product API.

## Development and support

Run `npm ci`, `npm run lint`, and `npm test` to build and validate the package with the n8n node CLI. Source and release automation: [liftaven/n8n-nodes-liftaven](https://github.com/liftaven/n8n-nodes-liftaven). Report node issues in [GitHub Issues](https://github.com/liftaven/n8n-nodes-liftaven/issues).

Product: [Liftaven](https://liftaven.com) · [Privacy](https://liftaven.com/privacy/) · [Agent skill](https://github.com/liftaven/agent-skill)

MIT license.

## REST API contract

The request origin and OAuth resource are the product API shown above. GET reads a resource, POST creates or requests an explicitly confirmed action, PATCH updates, and DELETE removes the selected owned resource. The node does not forward requests to a protocol server. Authentication, permissions and ownership are enforced before the API executes an operation.

## Release checks (3.1.0)

Resource and Operation definitions are explicit in the TypeScript node source. This minor update preserves API endpoints, credential types and operation identifiers. Every publication must pass Prettier, the official n8n node CLI linter with zero warnings, the runtime tests, and the n8n community package scanner against both TypeScript source and compiled JavaScript. GitHub Actions runs these checks before publishing with npm provenance.

Run `npm ci --ignore-scripts`, `npm test`, and `npm run review` before proposing a release.

Liftaven follows n8n's default of 50 for newly added optional Limit fields and masks cursor/token fields in the editor. Saved workflow parameters retain their existing values; the API schema defaults and server pagination behavior are unchanged.
