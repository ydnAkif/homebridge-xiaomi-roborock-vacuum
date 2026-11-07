Room cleaning selection fix

Idle status polls during roomTimeout must not clear pending room selections. Clear selections only after an observed cleaning session finishes; preserve selections while paused. Capture selected room IDs before connection refresh so a refresh cannot silently convert room cleaning into whole-home cleaning. Cancel a pending timer when the last room is deselected and report timer failures without an automatic full-clean fallback.

Validation: 122 Jest tests and 24 snapshots pass; TypeScript build passes. Regression tests reproduce idle polling during the 30-second delay, deselection, and a refresh that clears mutable selection. No physical cleaning is started by tests.
