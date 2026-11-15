import { getTableName, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * A column written out with its table's name, for use inside a subquery.
 *
 * When a query reads from one table, Drizzle writes that table's columns
 * bare: `"id"`, not `"conversation"."id"`. Inside a subquery a bare name
 * means the subquery's own table first, so
 * `(select count(*) from message m where m.conversation_id = ${conversation.id})`
 * quietly compared each message with itself and counted nothing. Wrapping
 * the outer column in this says which table is meant.
 */
export function outer(column: AnyPgColumn) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

/**
 * Whether the account in a column is marked as a tester (test data, not
 * the event's). Pass the column through `outer()` when the query selects
 * from one table only, for the reason given above.
 */
export const isTester = (userColumn: SQL) =>
  sql`exists (select 1 from tester_account tester where tester.user_id = ${userColumn})`;
