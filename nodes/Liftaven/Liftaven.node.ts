import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INodeProperties,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";
import { executeOperations, type Operation } from "./transport";
import operations from "./operations.json";
import properties from "./properties.json";

export class Liftaven implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Liftaven",
    name: "liftaven",
    icon: { light: "file:liftaven.svg", dark: "file:liftaven.svg" },
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Automate your Liftaven account",
    defaults: { name: "Liftaven" },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [{ name: "liftavenOAuth2Api", required: true }],
    properties: properties as INodeProperties[],
  };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    return executeOperations(
      this,
      "https://mcp.liftaven.com/mcp",
      "liftavenOAuth2Api",
      operations as unknown as Operation[],
    );
  }
}
