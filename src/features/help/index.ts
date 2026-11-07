/**
 * Public surface of the help feature — the in-app guide (Pusat Panduan).
 *
 * Its content is generated from the PDF manuals by
 * `automation/build-guide-web.mjs` into `src/content/help/`; nothing in this
 * folder holds guide text of its own.
 */
export { HelpHome } from "./components/HelpHome";
export { HelpModuleScreen } from "./components/HelpModuleScreen";
export { HelpArticleScreen } from "./components/HelpArticleScreen";
export { HelpFaqScreen } from "./components/HelpFaqScreen";
export { HelpButton } from "./components/HelpButton";
export { helpArticle, helpModule, helpModules, helpRelease } from "./content";
export { helpHrefFor } from "./route";
export type { HelpArticle, HelpFaq, HelpModule, HelpRelease, HelpRoute } from "./types";
