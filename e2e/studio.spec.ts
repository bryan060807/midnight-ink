import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { exercises, lessons } from '../src/lib/curriculum';
import { mkdirSync } from 'node:fs';

test.beforeEach(async ({ request }) => {
  // The test server uses its own .data/e2e database on port 3100.
  const response = await request.delete('/api/data', { data: { confirm: 'DELETE' } });
  expect(response.ok()).toBeTruthy();
});

test('a beginner can learn, log practice, manage equipment and ask offline Rook', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continue Learning', exact: true })).toBeVisible();
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/screenshots/dashboard-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel('Learning path', { exact: true }).selectOption('drawing');
  await page.getByRole('button', { name: 'Save learning path', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/workspace')).json()).profile.path).toBe('drawing');

  await page.getByRole('link', { name: 'Continue Learning', exact: true }).click();
  const selectedLesson = lessons.find(lesson => lesson.moduleId === 'drawing')!;
  await page.getByRole('button').filter({ hasText: selectedLesson.title }).click();
  const reflection = page.getByLabel('Your answer or reflection', { exact: true });
  await reflection.fill('I will keep this exercise on paper and compare one controlled movement at a time.');
  await page.getByRole('button', { name: 'Complete lesson', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/workspace')).json()).lessonProgress.length).toBe(1);
  await page.reload();
  await expect(page.getByText(/completed/i).first()).toBeVisible();

  await page.goto('/equipment');
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page.getByLabel('Name *', { exact: true }).fill('My baseline pen');
  await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My baseline pen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit My baseline pen', exact: true }).click();
  await page.getByLabel('Personal notes', { exact: true }).fill('Model and stroke still unknown.');
  await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
  await expect(page.getByText('Model and stroke still unknown.', { exact: true })).toBeVisible();

  await page.goto('/practice');
  await page.getByRole('button', { name: 'Start practice session', exact: true }).click();
  await page.getByLabel('Logged practice time (minutes)', { exact: true }).fill('12');
  await page.getByLabel('Practice notes', { exact: true }).fill('First baseline: the final two lines were steadier.');
  await page.getByLabel('One improvement goal', { exact: true }).fill('Keep my grip light.');
  await page.getByRole('button', { name: 'Save practice session', exact: true }).click();
  await expect(page.getByText('First baseline: the final two lines were steadier.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Keep my grip light.', { exact: false })).toBeVisible();

  await page.goto('/coach');
  await page.getByRole('textbox').fill('How can I make my straight lines smoother?');
  await page.getByRole('button', { name: /Ask Rook/i }).click();
  await expect(page.getByText('Original curated guidance', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/ten pairs of endpoints/i)).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/workspace')).json()).coaching.length).toBe(1);

  await page.goto('/progress');
  await expect(page.getByText('First baseline: the final two lines were steadier.', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/progress-desktop.png', fullPage: true });
});

test('practice photos are normalized, compared, exported and removed with their records', async ({ page, request }) => {
  const sessionResponse = await request.post('/api/sessions', { data: { exerciseId: exercises[0].id, durationMinutes: 10, notes: 'Photo comparison baseline.' } });
  expect(sessionResponse.status()).toBe(201);
  const session = await sessionResponse.json();
  const photoIds: string[] = [];
  for (const color of ['#dddddd', '#eeeeee']) {
    const buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).withMetadata().png().toBuffer();
    const response = await request.post('/api/photos', { multipart: { sessionId: session.id, file: { name: '../../untrusted.png', mimeType: 'image/png', buffer } } });
    expect(response.status()).toBe(201);
    const photo = await response.json();
    photoIds.push(photo.id);
    const saved = await request.get(photo.url);
    expect(saved.headers()['content-type']).toBe('image/jpeg');
    expect((await sharp(await saved.body()).metadata()).exif).toBeUndefined();
  }
  const forged = await request.post('/api/photos', { multipart: { sessionId: session.id, file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<script>not an image</script>') } } });
  expect(forged.status()).toBe(400);
  await page.goto('/practice');
  await page.getByRole('combobox', { name: 'Earlier / left image', exact: true }).selectOption(photoIds[0]);
  await page.getByRole('combobox', { name: 'Later / right image', exact: true }).selectOption(photoIds[1]);
  await expect(page.getByRole('img', { name: 'Earlier / left image', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Later / right image', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/practice-comparison.png', fullPage: true });
  const exported = await request.get('/api/export');
  expect(exported.headers()['content-disposition']).toContain('attachment');
  expect((await exported.json()).photos).toHaveLength(2);
  expect((await request.delete(`/api/photos/${photoIds[0]}`)).ok()).toBeTruthy();
  expect((await request.get(`/api/photos/${photoIds[0]}`)).status()).toBe(404);
  expect((await request.delete(`/api/sessions/${session.id}`)).ok()).toBeTruthy();
  expect((await request.get(`/api/photos/${photoIds[1]}`)).status()).toBe(404);
  const remaining = await (await request.get('/api/workspace')).json();
  expect(remaining.sessions).toHaveLength(0);
  expect(remaining.photos).toHaveLength(0);
});

test('design templates, undo, mirror, save and reopen produce a real persisted document', async ({ page, request }) => {
  await page.goto('/design');
  await page.getByLabel('Study name', { exact: true }).fill('First northbound study');
  await page.getByRole('button', { name: /Northbound/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Mirror horizontally', exact: true }).click();
  await page.getByRole('button', { name: 'Save study', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/workspace')).json()).designs.length).toBe(1);
  const workspace = await (await request.get('/api/workspace')).json();
  expect(workspace.designs[0].document.elements.length).toBeGreaterThan(0);
  expect(workspace.designs[0].document.mirror).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'First northbound study', exact: true }).click();
  await expect(page.getByLabel('Study name', { exact: true })).toHaveValue('First northbound study');
  await expect(page.getByRole('button', { name: 'Mirror horizontally', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.svg$/);
  await page.screenshot({ path: 'test-results/design-desktop.png', fullPage: true });
});

test('all nine destinations work on mobile without horizontal overflow', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/learn', '/practice', '/coach', '/design', '/equipment', '/progress', '/library', '/settings']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('link', { name: 'Learn', exact: true }).last().click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.getByRole('link', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await page.getByRole('link', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/design$/);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).last().click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
});

test('API rejects unauthorized cross-origin changes and requires explicit data deletion', async ({ request }) => {
  expect((await request.post('/api/equipment', { headers: { origin: 'https://evil.example' }, data: { kind: 'machine', name: 'Not allowed' } })).status()).toBe(403);
  expect((await request.post('/api/equipment', { data: { kind: 'machine', name: 'Not owned', profileId: 'other' } })).status()).toBe(400);
  expect((await request.delete('/api/data', { data: { confirm: 'not confirmed' } })).status()).toBe(400);
  const added = await request.post('/api/equipment', { data: { kind: 'machine', name: 'Owned inventory to delete' } });
  expect(added.status()).toBe(201);
  const record = await added.json();
  expect((await request.patch(`/api/equipment/${record.id}`, { data: { profileId: 'other' } })).status()).toBe(400);
  expect((await (await request.get('/api/workspace')).json()).equipment[0].name).toBe('Owned inventory to delete');
  const response = await request.get(`/api/worksheets/${exercises[0].id}`);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<svg');
  expect((await request.delete('/api/data', { data: { confirm: 'DELETE' } })).ok()).toBeTruthy();
  const deletedWorkspace = await (await request.get('/api/workspace')).json();
  expect(deletedWorkspace.equipment).toHaveLength(0);
  expect(deletedWorkspace.sessions).toHaveLength(0);
  expect(deletedWorkspace.designs).toHaveLength(0);
});
