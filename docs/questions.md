# Questions and Clarifications

## 1. Seat hold conflict handling across tabs
Question: Prompt text requires auto-release and prevention of local overselling when multiple browser tabs are open, but does not prescribe a specific synchronization mechanism.

My Understanding: Any deterministic browser-local coordination strategy is acceptable if concurrent tab behavior remains consistent.

Solution: Implemented cross-tab state synchronization so hold/create/release events are reflected between tabs quickly, with a 10-minute hold expiry auto-release path.

## 2. Meaning of "real-time" availability in browser-only mode
Question: Prompt states that availability is calculated in real time, but no fixed refresh cadence or interval is defined.

My Understanding: Real-time should be interpreted as immediate recomputation on user actions and state updates, not server-pushed streaming.

Solution: Availability is recalculated on seat interactions and hold lifecycle events so booking context updates continuously from local state.

## 3. Expired association lifecycle behavior
Question: Prompt says expired associations are hidden by default but can be toggled visible; it does not define whether they should be deleted or retained.

My Understanding: Expired records should remain persisted for history and operational traceability.

Solution: Kept expired associations in storage, filtered by default in UI, and exposed via explicit "show expired" control.

## 4. Question lifecycle deletion semantics
Question: Prompt requests soft-delete and restore but does not define hard-delete policy.

My Understanding: Soft-delete should preserve recoverability and historical context; hard-delete is not required for normal author workflow.

Solution: Applied soft-delete status transitions with restore support and avoided destructive deletion in primary management flow.

## 5. Short-answer scoring path
Question: Prompt includes short answer as a question type, but does not explicitly assign it to objective or manual grading mode.

My Understanding: Short-answer should be manual by default because it typically requires reviewer judgment.

Solution: Routed short-answer through manual grading and second-review policy paths, while keeping objective types auto-graded.

## 6. Second-review threshold interpretation
Question: Prompt says second review is required for score changes over 10 points, but does not define exact state transition semantics.

My Understanding: Threshold crossings should block immediate finalization until second-review policy conditions are satisfied.

Solution: Implemented policy gating around large deltas so review flow enforces second-review control before grade completion.

## 7. Quiet-hours delivery behavior
Question: Prompt requires quiet hours, retries, and dead-letter support, but does not explicitly say whether quiet-hour messages should be dropped or deferred.

My Understanding: Quiet hours imply deferred in-app delivery, not permanent discard.

Solution: Quiet-hour-blocked messages are kept pending, retried in policy windows, and moved to dead-letter after retry exhaustion.

## 8. UI language preference constraints
Question: Prompt states UI language is set to English and localStorage stores preferences; it does not define multilingual switching requirements.

My Understanding: English is fixed for this delivery and preference storage should preserve that operational baseline.

Solution: Kept language preference in lightweight local storage with English as enforced default behavior.

## 9. Sensitive data boundary for encryption at rest
Question: Prompt explicitly names health preferences and grader notes as sensitive fields, but does not list additional optional sensitive fields.

My Understanding: At minimum, all explicitly named sensitive fields must be encrypted before IndexedDB persistence.

Solution: Encrypted wellness preferences and grader notes at rest using Web Crypto envelopes in browser storage.

## 10. Metadata and export trust model
Question: Prompt requires schema validation and SHA-256 fingerprint checks but does not define acceptance order.

My Understanding: Import should fail fast on schema mismatch, then fail on fingerprint mismatch for tamper protection.

Solution: Applied strict import validation sequence: schema marker validation, structural validation, then SHA-256 integrity verification.
