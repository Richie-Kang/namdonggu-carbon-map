import { test, expect, request as pwRequest } from '@playwright/test';

test('home loads and shows brand', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('남동구 탄소지도')).toBeVisible({ timeout: 15_000 });
});

test('legend renders quintile swatches', async ({ page }) => {
  await page.goto('/');
  // getByText(/CO₂/)는 legend item 등 다수 매칭 — label 텍스트로 한정
  await expect(page.locator('text=CO₂ 배출량').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('추정치 · 정성적 비교용')).toBeVisible();
});

test('layer toggles are interactive', async ({ page }) => {
  await page.goto('/');
  // getByLabel('건물')은 legend의 '건물 단위' 텍스트 등 다수 매칭 — role로 한정
  const buildingsToggle = page.getByRole('checkbox', { name: '건물' });
  const gridToggle = page.getByRole('checkbox', { name: '100m 격자' });
  await expect(buildingsToggle).toBeChecked();
  await expect(gridToggle).toBeChecked();
  await buildingsToggle.click();
  await expect(buildingsToggle).not.toBeChecked();
});

test('health endpoint responds with expected shape', async ({ request }) => {
  const r = await request.get('/api/health');
  expect([200, 503]).toContain(r.status());
  const body = await r.json();
  for (const k of ['db', 'model', 'tiles', 'version', 'checked_at']) {
    expect(body).toHaveProperty(k);
  }
});

test('invalid predict body returns 400 with zod issues', async ({ request }) => {
  const r = await request.post('/api/predict', { data: { foo: 1 } });
  expect(r.status()).toBe(400);
  const body = await r.json();
  expect(body.error).toBe('schema');
  expect(Array.isArray(body.issues)).toBeTruthy();
});

test('invalid bbox returns 400', async ({ request }) => {
  const r = await request.get('/api/buildings?bbox=bad');
  expect(r.status()).toBe(400);
});

test('invalid grid_id returns 400', async ({ request }) => {
  const r = await request.get('/api/grid/top?grid_id=!nope!');
  expect(r.status()).toBe(400);
});

test('foreign Origin is rejected by CORS middleware', async ({ request }) => {
  const r = await request.get('/api/health', {
    headers: { Origin: 'https://evil.example.com' },
  });
  expect(r.status()).toBe(403);
  const body = await r.json();
  expect(body.error).toBe('cors_origin_not_allowed');
});

test('OPTIONS preflight from allowed origin returns 204 with CORS headers', async ({ request }) => {
  const r = await request.fetch('/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
    },
  });
  expect(r.status()).toBe(204);
  expect(r.headers()['access-control-allow-origin']).toBe('http://localhost:3000');
});

test('rate limiter eventually returns 429 under burst', async () => {
  test.setTimeout(60_000); // 65 sequential requests can exceed the 30s default
  const ctx = await pwRequest.newContext({
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
  });
  let saw429 = false;
  // 65 requests sequentially on the same IP exceed LIMIT=60/min in-memory limiter.
  for (let i = 0; i < 65; i++) {
    const r = await ctx.get('/api/health');
    if (r.status() === 429) { saw429 = true; break; }
  }
  await ctx.dispose();
  expect(saw429).toBeTruthy();
});
