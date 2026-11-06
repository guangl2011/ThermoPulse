import type { JSX } from "react";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

interface NumberFieldProps {
  id: string;
  label: string;
  /** NaN renders as an empty box so the user sees the field needs input. */
  value: number;
  onChange: (raw: string) => void;
  error?: string;
  hint?: string;
  unit?: string;
  step?: number;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  const ids = [error !== undefined && `${id}-error`, hint !== undefined && `${id}-hint`].filter(
    (part): part is string => typeof part === "string",
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function Hint({ id, hint }: { id: string; hint?: string }): JSX.Element | null {
  if (hint === undefined) {
    return null;
  }
  return (
    <span id={`${id}-hint`} className="tp-field__hint">
      {hint}
    </span>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }): JSX.Element | null {
  if (error === undefined) {
    return null;
  }
  return (
    <span id={`${id}-error`} className="tp-field__error" role="alert">
      {error}
    </span>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: TextFieldProps): JSX.Element {
  return (
    <label className="tp-field">
      <span className="tp-field__label">{label}</span>
      <input
        id={id}
        className={`tp-field__input${error !== undefined ? " tp-field__input--invalid" : ""}`}
        type="text"
        value={value}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(event) => onChange(event.target.value)}
      />
      <Hint id={id} hint={hint} />
      <ErrorText id={id} error={error} />
    </label>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  unit,
  step,
}: NumberFieldProps): JSX.Element {
  return (
    <label className="tp-field">
      <span className="tp-field__label">
        {label}
        {unit !== undefined && <span className="tp-field__unit">({unit})</span>}
      </span>
      <input
        id={id}
        className={`tp-field__input${error !== undefined ? " tp-field__input--invalid" : ""}`}
        type="number"
        step={step}
        value={Number.isNaN(value) ? "" : value}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(event) => onChange(event.target.value)}
      />
      <Hint id={id} hint={hint} />
      <ErrorText id={id} error={error} />
    </label>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: SelectFieldProps): JSX.Element {
  return (
    <label className="tp-field">
      <span className="tp-field__label">{label}</span>
      <select
        id={id}
        className="tp-field__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
