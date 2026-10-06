import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class LiftavenOAuth2Api implements ICredentialType {
  name = "liftavenOAuth2Api";
  displayName = "Liftaven OAuth2 API";
  documentationUrl =
    "https://github.com/liftaven/n8n-nodes-liftaven#authentication";
  icon = { light: "file:liftaven.svg", dark: "file:liftaven.svg" } as const;
  extends = ["oAuth2Api"];
  properties: INodeProperties[] = [
    {
      displayName: "Use Dynamic Client Registration",
      name: "useDynamicClientRegistration",
      type: "hidden",
      default: true,
    },
    {
      displayName: "Server URL",
      name: "serverUrl",
      type: "hidden",
      default: "https://api.liftaven.com/v1",
    },
    {
      displayName: "Resource URL",
      name: "resourceUrl",
      type: "hidden",
      default: "https://api.liftaven.com/v1",
    },
  ];
}
