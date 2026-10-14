'use strict';
/**
 * ui-observe.cjs — record what a UI build renders, for `oracle.cjs diff-ui`. Zero dependencies.
 *
 * Used from frozen UI specs (specs/fixtures/ui/*.spec.ts):
 *
 *   const { observe } = require('../../.sdd/scripts/ui-observe.cjs');
 *   test('title screen', async ({ page }) => {
 *     // covers: inv:V1
 *     await page.goto('/');
 *     await observe(page, 'title-screen');            // whole page
 *     await observe(page, 'level-grid', page.getByTestId('level-grid'));
 *   });
 *
 * Each call appends one JSON line { name, path, testids, aria } to the file named by SDD_UI_OBS_FILE
 * (no-op when unset). `aria` is Playwright's ARIA snapshot (roles, accessible names, text) — the
 * semantic, user-observable structure, independent of CSS and DOM details. Names must be unique.
 */
const fs = require('fs');
const path = require('path');

async function observe(page, name, locator) {
  const file = process.env.SDD_UI_OBS_FILE;
  if (!file) return;
  const root = locator || page.locator('body');
  const aria = await root.ariaSnapshot();
  const testids = await root.locator('[data-testid]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
  const record = { name, path: new URL(page.url()).pathname, testids, aria };
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
}

module.exports = { observe };
