import "dotenv/config";
import path from "path";
import fs from "fs";
import { initializeDatabase, setupSchema } from "../src/core/database.js";
import { CalendarReminderTool } from "../src/drivers/tools/calendar_reminder/index.js";
import { OCRTool } from "../src/drivers/tools/ocr/index.js";

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  cyan:  '\x1b[36m',
  bold:  '\x1b[1m'
};

const ok = (msg: string) => console.log(`${c.green}  ✓${c.reset} ${msg}`);
const fail = (msg: string) => console.log(`${c.red}  ✗${c.reset} ${msg}`);

async function runTests() {
  console.log(`\n${c.bold}${c.cyan}═══ CALENDAR & OCR TOOL TESTS ═══${c.reset}`);

  // Inisialisasi DB & Schema
  const db = initializeDatabase();
  setupSchema(db);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Calendar Reminder Tool
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${c.bold}1. Testing Calendar Reminder Tool${c.reset}`);
  
  // 1a. Create Reminder (Relative time)
  const createRes1 = await CalendarReminderTool.execute({
    action: "create",
    title: "Minum Air Putih",
    scheduledTime: "in 15 minutes"
  }, { contextId: "test_context", perceivedName: "Al" });

  let createdId = "";
  if (createRes1.success && createRes1.reminder) {
    createdId = createRes1.reminder.id;
    ok(`Create reminder (relative) success: ID = ${createdId}, Target = ${createRes1.reminder.nextRun}`);
  } else {
    fail(`Create reminder failed: ${createRes1.error}`);
  }

  // 1b. Create Reminder (ISO time)
  const isoTime = new Date(Date.now() + 600000).toISOString();
  const createRes2 = await CalendarReminderTool.execute({
    action: "create",
    title: "Meeting Penting",
    scheduledTime: isoTime
  }, { contextId: "test_context", perceivedName: "Al" });

  if (createRes2.success) {
    ok(`Create reminder (ISO) success`);
  } else {
    fail(`Create reminder (ISO) failed: ${createRes2.error}`);
  }

  // 1c. List Reminders
  const listRes = await CalendarReminderTool.execute({ action: "list" }, {} as any);
  if (listRes.success && Array.isArray(listRes.reminders)) {
    const hasWater = listRes.reminders.some(r => r.id === createdId);
    if (hasWater) {
      ok(`List reminders success. Found created reminder: "${listRes.reminders.find(r => r.id === createdId)?.title}"`);
    } else {
      fail(`List reminders success but created reminder ID was not found.`);
    }
  } else {
    fail(`List reminders failed: ${listRes.error}`);
  }

  // 1d. Delete Reminder
  if (createdId) {
    const deleteRes = await CalendarReminderTool.execute({
      action: "delete",
      reminderId: createdId
    }, {} as any);
    if (deleteRes.success) {
      ok(`Delete reminder (${createdId}) success`);
    } else {
      fail(`Delete reminder failed: ${deleteRes.error}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: OCR Tool
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${c.bold}2. Testing OCR Tool${c.reset}`);
  
  // Buat 1x1 transparent PNG valid untuk testing ocr
  const dummyImgPath = path.join(process.cwd(), "yui_tests", "dummy_image.png");
  const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  fs.writeFileSync(dummyImgPath, Buffer.from(base64Png, 'base64'));

  // Run OCR on valid image
  const ocrRes = await OCRTool.execute({ imagePath: dummyImgPath }, {} as any);
  if (ocrRes.success) {
    ok(`OCR successfully initialized and read empty image (text: "${ocrRes.text}")`);
  } else {
    fail(`OCR failed: ${ocrRes.error}`);
  }

  // Cleanup
  if (fs.existsSync(dummyImgPath)) {
    fs.unlinkSync(dummyImgPath);
  }

  console.log(`\n${c.bold}${c.green}All done!${c.reset}`);
  process.exit(0);
}

runTests().catch(err => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
