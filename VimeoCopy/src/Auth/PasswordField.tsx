import { useState } from "react";
import type { ChangeEvent } from "react";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  autoFocus?: boolean;
  /** Extra classes for the wrapping .form-group (pages style their groups differently). */
  groupClassName?: string;
}

/** Open eye — shown while the password is hidden, i.e. "click to reveal". */
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Struck-through eye — shown while the password is visible, i.e. "click to hide". */
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/**
 * Password input with a reveal toggle. Typing a password blind is the main cause of
 * "wrong password" retries, so every password field in the auth flows offers this.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  name,
  placeholder,
  autoComplete = "current-password",
  minLength,
  required,
  autoFocus,
  groupClassName = "",
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={`form-group ${groupClassName}`.trim()}>
      <label htmlFor={id}>{label}</label>

      <div className="password-field">
        <input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setRevealed((r) => !r)}
          // The button sits inside the field, so its purpose isn't obvious from anything visible.
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          title={revealed ? "Hide password" : "Show password"}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}
