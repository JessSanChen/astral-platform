/**
 * Shown immediately while a conversation's data is fetched, so clicking
 * between conversations feels instant even when the database is a network
 * hop away. Without it the previous conversation stays on screen and the
 * click appears to have done nothing.
 */
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[41px] border-b border-border" />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={i % 2 === 0 ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className="h-10 animate-pulse rounded-2xl bg-muted"
              style={{ width: i % 2 === 0 ? "40%" : "65%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
