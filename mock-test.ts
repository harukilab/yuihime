import { registerAPIRoutes } from "./src/core/server/apiRouter.js";

const mockApp: any = {
  get: (path: string) => console.log("REGISTERED: GET", path),
  post: (path: string) => console.log("REGISTERED: POST", path),
  put: (path: string) => console.log("REGISTERED: PUT", path),
  delete: (path: string) => console.log("REGISTERED: DELETE", path),
  all: (path: string) => console.log("REGISTERED: ALL", path),
  use: (path: string) => console.log("REGISTERED: USE", path),
};

const mockDb: any = {
  prepare: () => ({
    all: () => [],
    get: () => ({})
  })
};

console.log("=== STARTING MOCK ROUTE REGISTRATION TEST ===");
try {
  registerAPIRoutes(mockApp, mockDb);
  console.log("=== MOCK ROUTE REGISTRATION COMPLETED SUCCESSFULLY ===");
} catch (err: any) {
  console.error("=== MOCK ROUTE REGISTRATION FAILED ===");
  console.error(err);
}
