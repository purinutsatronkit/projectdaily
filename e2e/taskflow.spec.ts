import { expect, test, type Page } from '@playwright/test';

async function register(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'เริ่มจัดการงาน' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ชื่อที่ใช้แสดง').fill('ทดสอบ Playwright');
  await dialog.getByLabel('อีเมล').fill(email);
  await dialog.getByLabel('รหัสผ่าน').fill('Test!2026');
  await dialog.getByRole('button', { name: 'สร้างบัญชี', exact: true }).click();
  await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible();
}

test('สมัครบัญชีและเปิดรายการงานได้', async ({ page }) => {
  await register(page);
  await expect(page.getByRole('heading', { name: 'รายการงาน' })).toBeVisible();
});

test('สร้างงานและดูในปฏิทินเดือนที่เลือก', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'เพิ่มงานใหม่' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/ชื่องาน/).fill('Playwright calendar task');
  await dialog.getByLabel('วันครบกำหนด').fill('2027-11-15');
  await dialog.getByLabel('ความสำคัญ').selectOption('high');
  await dialog.getByRole('button', { name: 'เพิ่มงาน', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Playwright calendar task', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ปฏิทินงาน' }).click();
  await page.getByRole('combobox', { name: 'เลือกเดือน' }).selectOption('11');
  await page.getByRole('spinbutton', { name: 'ปี พ.ศ.' }).fill('2570');
  await page.getByRole('spinbutton', { name: 'ปี พ.ศ.' }).press('Tab');
  await expect(page.getByRole('heading', { name: 'พฤศจิกายน 2570' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Playwright calendar task วันที่ 15/ })).toBeVisible();
});

test('สร้างโปรเจกต์แล้วเลือกงานในโปรเจกต์ได้', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'สร้างโปรเจกต์' }).click();
  const dialog = page.getByRole('dialog', { name: 'สร้างโปรเจกต์' });
  await dialog.getByLabel('ชื่อโปรเจกต์').fill('Playwright Project');
  await dialog.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByRole('combobox', { name: 'โปรเจกต์' })).toContainText('Playwright Project');
});

test('บันทึกร่าง สก.09 แล้วข้อมูลยังอยู่หลังรีโหลด', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'บันทึก สก.09' }).click();
  await page.getByLabel('ชื่อ–สกุล').fill('ผู้ทดสอบ ระบบ');
  await page.getByLabel('รหัสนิสิต').fill('12345678');
  await page.getByRole('button', { name: 'บันทึกร่าง' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'บันทึกร่างแล้ว' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'บันทึก สก.09' }).click();
  await expect(page.getByLabel('ชื่อ–สกุล')).toHaveValue('ผู้ทดสอบ ระบบ');
  await expect(page.getByLabel('รหัสนิสิต')).toHaveValue('12345678');
});

test('ทำงานเสร็จ ค้นหา และออกจากระบบ', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'เพิ่มงานใหม่' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/ชื่องาน/).fill('Playwright complete task');
  await dialog.getByRole('button', { name: 'เพิ่มงาน', exact: true }).click();
  await page.getByRole('button', { name: 'ทำเครื่องหมาย Playwright complete task ว่าเสร็จแล้ว' }).click();
  await expect(page.getByRole('button', { name: 'เปิดงาน Playwright complete task อีกครั้ง' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'ค้นหางาน' }).fill('ไม่พบงานนี้แน่นอน');
  await expect(page.getByRole('heading', { name: 'ยังไม่พบงานที่ตรงกัน' })).toBeVisible();
  await page.getByRole('button', { name: 'เมนูโปรไฟล์' }).click();
  await page.getByRole('menuitem', { name: 'ออกจากระบบ' }).click();
  await expect(page.getByRole('button', { name: 'เริ่มจัดการงาน' })).toBeVisible();
});

test('หน้าจอมือถือไม่ล้นแนวนอนและปฏิทินเลื่อนได้', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-pixel-7', 'ทดสอบเฉพาะ viewport มือถือ');
  await register(page);
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole('button', { name: 'ปฏิทินงาน' }).click();
  const calendar = page.getByRole('region', { name: 'ตารางปฏิทินรายเดือน เลื่อนแนวนอนได้บนมือถือ' });
  await expect(calendar).toBeVisible();
  const dimensions = await calendar.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  await calendar.evaluate(element => { element.scrollLeft = 160; });
  await expect.poll(() => calendar.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});

test('แชท AI เสนอคำสั่งและบันทึกหลังยืนยันเท่านั้น', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'เปิดแชท AI' }).click();
  const chat=page.getByRole('region', { name: 'ผู้ช่วย AI' });
  await expect(chat.getByRole('button', { name: 'ส่งคำสั่ง AI' })).toBeDisabled();
  await chat.getByRole('checkbox').check();
  await chat.getByLabel('คำสั่งสำหรับ AI').fill('Playwright AI สร้างงาน');
  await chat.getByRole('button', { name: 'ส่งคำสั่ง AI' }).click();
  await expect(chat.getByText('ตรวจรายละเอียดงานก่อนยืนยัน')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Playwright AI สร้างงาน', exact: true })).toHaveCount(0);
  await chat.getByRole('button', { name: 'ยืนยันและบันทึก' }).click();
  await expect(page.getByRole('button', { name: 'Playwright AI สร้างงาน', exact: true })).toBeVisible();
});

test('หน้าอีเมลแจ้งเตือนแสดงสถานะและซ่อน n8n ที่ไม่จำเป็น', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'เมนูโปรไฟล์' }).click();
  await page.getByRole('menuitem', { name: 'การเชื่อมต่อ' }).click();
  await expect(page.getByRole('heading', { name: 'อีเมลเตือนงานอัตโนมัติ' })).toBeVisible();
  await expect(page.getByText('ผู้ดูแลเว็บยังไม่ได้ตั้งค่า SMTP สำหรับส่งอีเมล')).toBeVisible();
  const advanced=page.getByText('การเชื่อมต่อขั้นสูง: API Key และ n8n (ไม่จำเป็น)');
  await expect(advanced).toBeVisible();
  await expect(page.getByRole('button', { name: 'สร้างคีย์' })).not.toBeVisible();
  await advanced.click();
  await expect(page.getByRole('button', { name: 'สร้างคีย์' })).toBeVisible();
});
