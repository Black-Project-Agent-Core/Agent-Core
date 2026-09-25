import { requestPrereleaseExit } from "./prerelease-lib.mjs";

const state = await requestPrereleaseExit();
console.log(JSON.stringify(state, null, 2));
