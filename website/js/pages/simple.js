/**
 * pages/simple.js — Boot helper for static content pages.
 *
 * Used by pages that need no API data (affiliates, support). It reads the page
 * title from the document and mounts the shared header and footer.
 */

import { boot, setTitle } from "../site.js";

async function main() {
  await boot();
  const h1 = document.querySelector("h1");
  setTitle(h1 ? h1.textContent.trim() : "Page");
}

main();