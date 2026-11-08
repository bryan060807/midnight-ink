import { test, expect, type Page, type BrowserContext } from '@playwright/test';

async function signIn(page: Page, user: 'Alice' | 'Bob', destination = '/equipment') {
  await page.goto(destination);
  await expect(page.getByText('Continue with AIBRY ID', { exact: true })).toBeVisible();
  await page.getByText('Continue with AIBRY ID', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mock AIBRY ID', exact: true })).toBeVisible();
  await page.getByRole('link', { name: `Sign in as ${user}`, exact: true }).click();
  await page.waitForURL(`**${destination}`);
  await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeVisible();
}
async function workspace(context: BrowserContext) {
  const response = await context.request.get('/api/workspace'); expect(response.status()).toBe(200); return response.json();
}

test('two browser identities receive separate workspaces, opaque sessions, safe return and working logout', async ({ browser, baseURL }) => {
  const alice = await browser.newContext({ baseURL }), bob = await browser.newContext({ baseURL });
  try {
    const alicePage = await alice.newPage(), bobPage = await bob.newPage();
    const anonymous = await alice.request.get('/api/workspace'); expect(anonymous.status()).toBe(401);
    await signIn(alicePage, 'Alice');
    const aliceData = await workspace(alice); expect(aliceData.profile.id).not.toBe('local-demo'); expect(aliceData.equipment).toHaveLength(0);
    await alicePage.getByRole('button', { name: 'Add equipment', exact: true }).click();
    await alicePage.getByLabel('Name *', { exact: true }).fill('Alice private practice pen');
    await alicePage.getByRole('button', { name: 'Save equipment', exact: true }).click();
    await expect(alicePage.getByRole('heading', { name: 'Alice private practice pen', exact: true })).toBeVisible();
    const aliceEquipment = (await workspace(alice)).equipment[0];
    await signIn(bobPage, 'Bob');
    const bobData = await workspace(bob); expect(bobData.profile.id).not.toBe(aliceData.profile.id); expect(bobData.equipment).toHaveLength(0);
    expect((await bob.request.patch(`/api/equipment/${aliceEquipment.id}`, { headers: { origin: baseURL! }, data: { name: 'Taken' } })).status()).toBe(404);
    expect((await bob.request.delete(`/api/equipment/${aliceEquipment.id}`, { headers: { origin: baseURL! } })).status()).toBe(404);
    expect(JSON.stringify(await (await bob.request.get(`/api/export?profileId=${aliceData.profile.id}`)).json())).not.toContain('Alice private practice pen');
    const cookies = await alice.cookies();
    const session = cookies.find(c => c.name === 'mi_session'); expect(session).toBeDefined(); expect(session!.httpOnly).toBe(true); expect(session!.sameSite).toBe('Lax'); expect(session!.expires).toBeGreaterThan(Date.now() / 1000);
    const sessionResponse = await alice.request.get('/api/auth/session'); expect(sessionResponse.status()).toBe(200);
    const sessionJson = await sessionResponse.text(); expect(sessionJson).not.toContain(session!.value); expect(sessionJson).not.toContain('test-only-generated-provider-e2e-session-secret');
    await alicePage.reload(); await expect(alicePage.getByRole('heading', { name: 'Alice private practice pen', exact: true })).toBeVisible();
    await alicePage.goto('/settings');
    await expect(alicePage.getByText(/mock-alice/).first()).toBeVisible();
    await alicePage.getByRole('button', { name: 'Sign out', exact: true }).first().click();
    await expect(alicePage.getByText('Continue with AIBRY ID', { exact: true })).toBeVisible();
    expect((await alice.request.get('/api/workspace')).status()).toBe(401);
    expect((await bob.request.get('/api/workspace')).status()).toBe(200);
  } finally { await alice.close(); await bob.close(); }
});

test('an invalidated session removes private workspace content and presents sign-in again', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage(); await signIn(page, 'Alice');
    const created = await context.request.post('/api/equipment', { headers: { origin: baseURL! }, data: { kind: 'machine', name: 'Private expiry verification item' } }); expect(created.status()).toBe(201);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Private expiry verification item', exact: true })).toBeVisible();
    const session = (await context.cookies()).find(cookie => cookie.name === 'mi_session')!;
    await context.addCookies([{ ...session, value: 'invalidated-session-cookie-with-no-server-record' }]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('Continue with AIBRY ID', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Private expiry verification item', exact: true })).toHaveCount(0);
    expect((await context.request.get('/api/workspace')).status()).toBe(401);
  } finally { await context.close(); }
});
