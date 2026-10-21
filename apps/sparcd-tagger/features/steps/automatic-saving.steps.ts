import { parseObservations } from '@sparcd/camtrap';
import { When, Then, expect, focusFrame, speciesApply, openWorkspace } from './support/world';
import { BUCKET, PREFIX_A } from './support/data';
const path = `${PREFIX_A}IMG002.JPG`;
const status = (page: import('@playwright/test').Page) => page.getByTestId('automatic-save');
async function saved(page: import('@playwright/test').Page) { await expect(status(page).getByRole('status')).toHaveText('Saved'); }

When('Coyote is applied for automatic saving', async ({ page, s3, scratch }) => {
  scratch.originalMedia = s3.text(BUCKET, `${PREFIX_A}media.csv`);
  scratch.snapshotKeys = s3.keys(BUCKET).filter(key => key.includes('.sparcd-tagger-snapshots/'));
  await focusFrame(page, 'IMG002.JPG');
  await speciesApply(page, 'Canis latrans').click();
});
Then('the Coyote is saved without manual controls or per-edit snapshots', async ({ page, s3, scratch }) => {
  await saved(page);
  expect(parseObservations(s3.text(BUCKET, `${PREFIX_A}observations.csv`)).find(o => o.mediaId === path)?.scientificName).toBe('Canis latrans');
  await expect(page.getByRole('button', { name: /^Sync/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Snapshots/ })).toHaveCount(0);
  expect(s3.keys(BUCKET).filter(key => key.includes('.sparcd-tagger-snapshots/'))).toEqual(scratch.snapshotKeys);
  if (scratch.originalMedia) expect(s3.text(BUCKET, `${PREFIX_A}.sparcd-tagger-original/media.csv`)).toBe(scratch.originalMedia);
});
When('the automatically saved upload is reloaded', async ({ page }) => { await page.reload(); await openWorkspace(page); await saved(page); });
When('the latest automatic action is undone', async ({ page }) => {
  await saved(page);
  await page.getByRole('button', { name: 'Undo latest action', exact: true }).click();
  await saved(page);
});
Then('the Coyote addition is reversed and its audit history remains', async ({ page, s3 }) => {
  expect(parseObservations(s3.text(BUCKET, `${PREFIX_A}observations.csv`)).filter(o => o.mediaId === path && o.scientificName)).toEqual([]);
  const meta = JSON.parse(s3.text(BUCKET, `${PREFIX_A}UploadMeta.json`));
  expect(meta.taggerActions).toHaveLength(2); expect(meta.taggerActions[1].undoOf).toBe(meta.taggerActions[0].id);
  await expect(page.getByRole('button', { name: 'Undo latest action', exact: true })).toBeDisabled();
});
When('two species edits straddle an automatic save', async ({ page }) => {
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false;
  await page.route('**/*', async route => {
    if (!held && route.request().method() === 'PUT' && decodeURIComponent(new URL(route.request().url()).pathname).endsWith(`/${PREFIX_A}observations.csv`)) {
      held = true; entered(); await gate;
    }
    await route.fallback();
  });
  await focusFrame(page, 'IMG002.JPG'); await speciesApply(page, 'Canis latrans').click();
  await waiting;
  await focusFrame(page, 'IMG002.JPG');
  await speciesApply(page, 'Odocoileus hemionus').click();
  release(); await saved(page);
});
Then('both species edits reach shared storage', async ({ s3 }) => {
  expect(parseObservations(s3.text(BUCKET, `${PREFIX_A}observations.csv`)).filter(o => o.mediaId === path).map(o => o.scientificName).sort()).toEqual(['Canis latrans', 'Odocoileus hemionus'].sort());
});
When('a completed edit loses connectivity before automatic saving', async ({ page, s3, scratch }) => {
  scratch.snapshotKeys = s3.keys(BUCKET).filter(key => key.includes('.sparcd-tagger-snapshots/'));
  await focusFrame(page, 'IMG002.JPG'); await speciesApply(page, 'Canis latrans').click();
  await page.context().setOffline(true);
});
Then('further collection edits and Undo are disabled', async ({ page }) => {
  await expect(status(page)).toContainText('Pending/reconnecting');
  await expect(page.getByRole('button', { name: 'Apply Mule Deer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo latest action', exact: true })).toBeDisabled();
});
When('the connection returns', async ({ page }) => { await page.context().setOffline(false); });
When('an existing identification is reviewed and automatically saved', async ({ page }) => {
  await focusFrame(page, 'IMG001.JPG'); await speciesApply(page, 'Odocoileus hemionus').click(); await saved(page);
});
Then('its review is reversed with the original event and identifier retained', async ({ s3 }) => {
  const observation = parseObservations(s3.text(BUCKET, `${PREFIX_A}observations.csv`)).find(o => o.mediaId === `${PREFIX_A}IMG001.JPG`)!;
  expect(observation.reviewEvents).toHaveLength(1);
  expect(observation.reviewEvents![0].reviewedBy).toBeTruthy(); expect(observation.reviewEvents![0].reversedBy).toBeTruthy();
});
