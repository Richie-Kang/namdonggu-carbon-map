import { test, expect } from '@playwright/test';

test('home loads and shows map', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('남동구 탄소지도')).toBeVisible({ timeout: 10_000 });
});

test('health endpoint responds', async ({ request }) => {
  const r = await request.get('/api/health');
  expect([200, 503]).toContain(r.status());
  const body = await r.json();
  expect(body).toHaveProperty('db');
  expect(body).toHaveProperty('model');
  expect(body).toHaveProperty('tiles');
});

test('invalid predict body is rejected', async ({ request }) => {
  const r = await request.post('/api/predict', { data: { foo: 1 } });
  expect(r.status()).toBe(400);
});
