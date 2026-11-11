import { Label } from "@/components/ui/label";

/** Label + control + optional error, used across forms. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {/* The id lets the control point at its own complaint, so a screen
          reader announces it with the field rather than somewhere below. */}
      {error && (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
