Room cleaning selection fix

Idle status polls during roomTimeout must not clear pending room selections. Clear selections only after an observed cleaning session finishes; preserve selections while paused. Capture selected room IDs before connection refresh so a refresh cannot silently convert room cleaning into whole-home cleaning. Cancel a pending timer when the last room is deselected and report timer failures without an automatic full-clean fallback.

Validation: 123 Jest tests and 24 snapshots pass; TypeScript build passes. Regression tests reproduce idle polling during the 30-second delay, deselection, and a refresh that clears mutable selection. No physical cleaning is started by tests.

Map correction: optional rooms[].serviceId preserves an existing HomeKit service subtype while rooms[].id is corrected against the vacuum get_room_mapping and Xiaomi Home room names. Omitting serviceId preserves previous behavior. Existing names, characteristic IDs, scenes and automations can retain their service identity. Validation includes dispatching corrected room 16 using the existing roomService20 identity.
