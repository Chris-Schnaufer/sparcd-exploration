import type { Page } from '@playwright/test';
import { Given, When, Then, expect, enterFocusView } from './support/world';
import { LOCATION_NAME, NEW_LOCATION_NAME, NEW_LOCATION_ID } from './support/data';
import { openSyncDialog, runLiveSync } from './support/flows';

const changeLocationButton = (page: Page) =>
  page
    .locator(
      'button[title^="Correct the recorded camera location"], button[title^="Pending location change to"]',
    )
    .first();

const changeLocationDialog = (page: Page) =>
  page.locator('div[role="dialog"][aria-label="Change location"]');

const locationPickerTrigger = (page: Page) =>
  changeLocationDialog(page).locator('button[aria-haspopup="listbox"]');

async function openChangeLocation(page: Page): Promise<void> {
  await changeLocationButton(page).click();
  await expect(changeLocationDialog(page)).toBeVisible();
}

async function pickLocation(page: Page, name: string): Promise<void> {
  const dialog = changeLocationDialog(page);
  await locationPickerTrigger(page).click();
  await dialog.getByRole('option', { name: new RegExp(name) }).click();
}

When('the change-location dialog is opened', async ({ page }) => {
  await openChangeLocation(page);
});

Then('the current recorded location is shown', async ({ page }) => {
  await expect(changeLocationDialog(page)).toContainText(LOCATION_NAME);
  await expect(changeLocationDialog(page)).toContainText('SAN15');
});

Then('locations can be searched by name or id from the shared registry', async ({ page }) => {
  const dialog = changeLocationDialog(page);
  await locationPickerTrigger(page).click();
  await dialog.getByPlaceholder('Filter by name or id…').fill(NEW_LOCATION_ID);
  await expect(dialog.getByRole('option', { name: new RegExp(NEW_LOCATION_NAME) })).toBeVisible();
  await expect(dialog.getByRole('option', { name: new RegExp(LOCATION_NAME) })).toHaveCount(0);
  await dialog.getByPlaceholder('Filter by name or id…').fill('');
  await page.keyboard.press('Escape'); // close the dropdown — leave it collapsed for later steps
});

Then('there is no way to add a location that is not already in the registry', async ({ page }) => {
  const text = await changeLocationDialog(page).innerText();
  expect(text).not.toMatch(/add (a )?location|create (a )?location/i);
});

When('a different location is picked and applied', async ({ page }) => {
  await pickLocation(page, NEW_LOCATION_NAME);
  await changeLocationDialog(page).getByRole('button', { name: /^Apply to all/ }).click();
  await expect(changeLocationDialog(page)).toHaveCount(0);
});

Then('the workspace toolbar shows the pending location change', async ({ page }) => {
  await expect(changeLocationButton(page)).toContainText(`location → ${NEW_LOCATION_NAME}`);
  await expect(changeLocationButton(page)).toHaveAttribute(
    'title',
    `Pending location change to ${NEW_LOCATION_NAME} — click to edit`,
  );
});

When('the current location is picked again', async ({ page }) => {
  await pickLocation(page, LOCATION_NAME);
});

Then('applying is disabled because nothing would change', async ({ page }) => {
  await expect(
    changeLocationDialog(page).getByRole('button', { name: /^Apply to all/ }),
  ).toBeDisabled();
  await changeLocationDialog(page).getByRole('button', { name: 'Cancel' }).click();
});

Given('a location change is pending', async ({ page }) => {
  await openChangeLocation(page);
  await pickLocation(page, NEW_LOCATION_NAME);
  await changeLocationDialog(page).getByRole('button', { name: /^Apply to all/ }).click();
  await expect(changeLocationButton(page)).toContainText('location →');
});

When('the pending change is cleared', async ({ page }) => {
  await openChangeLocation(page);
  await changeLocationDialog(page).getByRole('button', { name: 'Clear pending change' }).click();
});

Then('the workspace toolbar no longer shows a pending location change', async ({ page }) => {
  await expect(changeLocationButton(page)).toHaveAttribute(
    'title',
    'Correct the recorded camera location for this whole upload',
  );
});

When('the sync dialog is opened', async ({ page }) => {
  await openSyncDialog(page);
});

Then('the preview states the pending location change', async ({ page }) => {
  await expect(page.getByText(new RegExp(`Location → ${NEW_LOCATION_NAME}`))).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});

When('the sync is run live', async ({ page }) => {
  await runLiveSync(page);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
});

Then("every image's deployment is the new location", async ({ page }) => {
  await enterFocusView(page);
  await expect(page.locator('body')).toContainText(NEW_LOCATION_ID);
});
