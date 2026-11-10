/**
 * The header the sign-up form sends the event code in.
 *
 * On its own in this file so the sign-up page, which runs in the browser,
 * can share the name with the server without pulling the database client
 * into the page.
 */
export const EVENT_CODE_HEADER = "x-event-code";
