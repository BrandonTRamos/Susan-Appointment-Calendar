import { useId, type ReactNode } from 'react';

/** A labelled control, with a line beneath it saying what it is for when that needs saying. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (ids: { id: string; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': hint ? hintId : undefined })}
      {hint && (
        <p className="hint muted" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
