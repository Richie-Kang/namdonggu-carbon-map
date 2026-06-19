import { test, expect, request as pwRequest } from '@playwright/test';

test('home loads and shows brand', async ({ page }) => {
  await page.goto('/');
  // getByText strict 모드 위반 방지 — h1 heading으로 한정
  await expect(page.getByRole('heading', { name: '남동구 탄소지도' })).toBeVisible({ timeout: 15_000 });
});

test('legend renders quintile swatches', async ({ page }) => {
  await page.goto('/');
  // getByText(/CO₂/)는 legend item 등 다수 매칭 — label 텍스트로 한정
  await expect(page.locator('text=CO₂ 배출량').first()).toBeVisible({ timeout: 15_000 });
  // 초기 줌에 따라 '격자 내 상대분포' 또는 '추정치'가 붙으므로 공통 부분만 확인
  await expect(page.locator('text=선택 월 내 상대분포').first()).toBeVisible();
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
  test.setTimeout(30_000);
  const ctx = await pwRequest.newContext({
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
  });
  // reason: 병렬 요청으로 rate limiter를 빠르게 소진. 순차 요청은 /api/health의
  // DB 체크가 느린 CI 환경에서 60s를 초과해 타임아웃이 발생함.
  // Node.js 단일 스레드에서 미들웨어 카운터는 동기 연산이므로 병렬 65개는
  // LIMIT=60 초과를 보장한다.
  const responses = await Promise.all(
    Array.from({ length: 65 }, () => ctx.get('/api/health')),
  );
  const saw429 = responses.some((r) => r.status() === 429);
  await ctx.dispose();
  expect(saw429).toBeTruthy();
});
