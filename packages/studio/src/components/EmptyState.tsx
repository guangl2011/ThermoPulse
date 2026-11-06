import type { JSX } from "react";

interface EmptyStateProps {
  title: string;
  message: string;
}

/** Call to action shown in place of results — never a blank panel. */
export function EmptyState({ title, message }: EmptyStateProps): JSX.Element {
  return (
    <div className="tp-empty">
      <p className="tp-empty__title">{title}</p>
      <p className="tp-empty__message">{message}</p>
    </div>
  );
}
