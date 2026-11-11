import { test, expect } from '@playwright/test';

test('Google login opens authorization and returns to an authenticated workspace', async ({ page }) => {
  await page.route('https://accounts.google.com/o/oauth2/v2/auth?**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('nonce')).toBeTruthy();
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    expect(callback.origin).toBe('http://127.0.0.1:4179');
    callback.searchParams.set('code', 'playwright-google-code');
    callback.searchParams.set('state', url.searchParams.get('state')!);
    await route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: false }).first().click();
  await page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await page.request.get('/api/auth/me')).status()).toBe(200);
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.user.email).toBe('google-browser@example.test');
  // Theme overrides must survive replacing the Tailwind-specific directive.
  const theme = await page.evaluate(() => {
    const sample=document.createElement('span');
    sample.className='text-sm text-teal-700 bg-teal-50';
    document.body.append(sample);
    const style=getComputedStyle(sample);
    const result={color:style.color,background:style.backgroundColor,size:style.fontSize,lineHeight:style.lineHeight,font:style.fontFamily};
    sample.remove();
    return result;
  });
  expect(theme.color).toBe('rgb(169, 31, 46)');
  expect(theme.background).toBe('rgb(255, 241, 239)');
  expect(theme.size).toBe('16px');
  expect(theme.lineHeight).toBe('24px');
  expect(theme.font).toContain('IBM Plex Sans Thai');
});

test('login explains when Google is not configured', async ({ page }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({json:{google:false,github:false}}));
  await page.goto('/');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: false }).first().click();
  await expect(page.getByRole('status')).toContainText('การเข้าสู่ระบบด้วย Google ยังไม่พร้อมใช้งาน');
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google', exact: true })).toHaveCount(0);
});

test('Google provider lookup can recover after a connection error', async ({ page }) => {
  let attempts=0;
  await page.route('**/api/auth/providers', route => ++attempts===1 ? route.fulfill({status:503,json:{error:{message:'Unavailable'}}}) : route.fulfill({json:{google:true,github:false}}));
  await page.goto('/');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: false }).first().click();
  await expect(page.getByRole('alert')).toContainText('ตรวจสอบการเข้าสู่ระบบด้วย Google ไม่สำเร็จ');
  await page.getByRole('button', {name:'ลองอีกครั้ง',exact:true}).click();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google', exact: true })).toBeEnabled();
});
