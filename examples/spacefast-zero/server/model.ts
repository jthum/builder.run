import { compileDeployment } from "../deployment/compile.ts";
import { fixture } from "../deployment/fixture.ts";
export const deployment = compileDeployment(fixture(1), "deployed-app").deployment;
export const releaseId = "local-development";

export const testDeployment = false;
