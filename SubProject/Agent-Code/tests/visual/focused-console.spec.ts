import { expect, test } from '@playwright/test';

const viewports = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '980x680', width: 980, height: 680 },
];

for (const viewport of viewports) {
  test(`focused console ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
    await expect(page.getByPlaceholder('Describe a task or ask a question')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit prompt' })).toBeVisible();
    const currentConversation = page.getByRole('button', { name: 'General coding session, selected' });
    const agentCoreToggle = page.getByRole('button', { name: 'Expand Agent Core controls' });
    await expect(currentConversation).toBeVisible();
    await expect(agentCoreToggle).toBeVisible();
    await page.getByRole('button', { name: 'Collapse recent conversations' }).click();
    await expect(page.getByRole('button', { name: 'Design system review' })).toHaveCount(0);
    const currentBox = await currentConversation.boundingBox();
    const agentCoreBox = await agentCoreToggle.boundingBox();
    expect(currentBox).not.toBeNull();
    expect(agentCoreBox).not.toBeNull();
    expect(agentCoreBox!.y).toBeGreaterThanOrEqual(currentBox!.y + currentBox!.height);
    expect(agentCoreBox!.y - (currentBox!.y + currentBox!.height)).toBeLessThanOrEqual(18);
    await page.getByRole('button', { name: 'Expand recent conversations' }).click();
    const widthMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(widthMetrics.scrollWidth).toBe(widthMetrics.clientWidth);
    await expect(page).toHaveScreenshot(`focused-console-${viewport.name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}
