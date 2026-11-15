import { removeTestAccounts, resetSettings, sql } from "./db";

export default async function globalTeardown() {
  await removeTestAccounts();
  await resetSettings();
  await sql.end();
}
