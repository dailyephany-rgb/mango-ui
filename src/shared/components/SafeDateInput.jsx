import React, { useEffect, useState } from "react";

/**
 * Controlled date input that stays keyboard-friendly.
 * Native type="date" + value="" often blocks typing after clear; we keep a
 * draft while focused and never leave the parent stuck on "".
 */
export default function SafeDateInput({
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    if (!focused) setDraft(value || "");
  }, [value, focused]);

  return (
    <input
      type="date"
      className={className}
      aria-label={ariaLabel}
      value={focused ? draft : value || ""}
      onFocus={() => {
        setFocused(true);
        setDraft(value || "");
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        // Commit complete dates immediately (picker + finished typing).
        if (next) onChange(next);
      }}
      onBlur={() => {
        setFocused(false);
        if (draft) {
          if (draft !== value) onChange(draft);
        } else {
          // Restore last good value — never leave parent as "".
          setDraft(value || "");
        }
      }}
    />
  );
}
