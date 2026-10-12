import { expect, test } from '@playwright/test';

/**
 * Requiere backend con sesión válida (cookie) y al menos un cómic indexado.
 * Se ejecuta con `pnpm test:e2e` tras `pnpm dev` + backend arriba (fase 8 lo automatiza).
 * Variables: E2E_COMIC_ID para fijar el tomo; si no, usa el primero de la biblioteca.
 */
async function firstComicId(page): Promise<string> {
  const envId = process.env.E2E_COMIC_ID;
  if (envId) return envId;
  await page.goto('/');
  const link = page.locator('.card a[href^="/read/"]').first();
  await expect(link).toBeVisible({ timeout: 15000 });
  const href = await link.getAttribute('href');
  return href!.split('/read/')[1];
}

async function openReader(page, mode: 'gallery' | 'continuous'): Promise<void> {
  const id = await firstComicId(page);
  await page.goto(`/read/${id}`);
  const toggle = page.getByRole('button', { name: mode === 'gallery' ? 'Galería' : 'Continuo' });
  await toggle.click();
}

test('galería: una sola imagen visible y navegación', async ({ page }) => {
  await openReader(page, 'gallery');
  const stage = page.locator('[data-testid="gallery-stage"]');
  await stage.locator('img').waitFor({ timeout: 20000 });
  expect(await stage.locator('img').count()).toBe(1);

  const before = await page.locator('.reader-count').textContent();
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.locator('.reader-count')).not.toHaveText(before!);
  expect(await stage.locator('img').count()).toBe(1);
});

test('lector continuo: nunca más de 5 <img> en DOM con 100+ páginas', async ({ page }) => {
  await openReader(page, 'continuous');
  await page.locator('.reader-scroll img').first().waitFor({ timeout: 20000 });

  for (let i = 0; i < 6; i++) {
    await page.locator('[data-testid="reader-scroll"]').evaluate((el) => {
      el.scrollTop = el.scrollHeight * ((i + 1) / 7);
    });
    await page.waitForTimeout(600);
    const count = await page.locator('.reader-scroll img').count();
    expect(count).toBeLessThanOrEqual(5);
  }
});

test('refresco mantiene la página persistida (galería)', async ({ page }) => {
  await openReader(page, 'gallery');
  const stage = page.locator('[data-testid="gallery-stage"]');
  await stage.locator('img').waitFor({ timeout: 20000 });

  // Avanza 3 páginas y espera el debounce de sync (1500ms).
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  const before = await page.locator('.reader-count').textContent();
  await page.waitForTimeout(2500);

  await page.reload();
  await page.locator('[data-testid="gallery-stage"] img').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  const after = await page.locator('.reader-count').textContent();
  expect(after).toBe(before);
});
