# API Specification - TransitOps Frontend Service Contracts

## 1. Scope
This project is a pure frontend SPA and does not expose external HTTP APIs. The "API" in this document describes internal application-service contracts used by UI workflows.

## 2. Service Contract Conventions
1. All operations execute locally in browser context.
2. Authorization checks are enforced at service entry points.
3. Validation errors are returned/thrown with actionable messages for UI display.
4. Persistence targets are IndexedDB (primary) and localStorage (preferences).

## 3. Contract Areas

### 3.1 Authentication
- Register user credentials with salted hash storage.
- Login and session bootstrap.
- Logout and session teardown.

### 3.2 Trips and Seat Inventory
- Create/list trips.
- Configure seat map structures.
- Select seat, hold seat, release hold, and confirm booking.
- Compute live availability including hold and booking states.

### 3.3 Configuration Associations
- Create, read, update, and filter association records.
- Validate MM/DD/YYYY effective ranges.
- Toggle visibility for expired records.

### 3.4 Question Management
- Create/edit/copy/deactivate/soft-delete/restore question records.
- Validate question type, score range, difficulty, and scope metadata.

### 3.5 Attempts and Grading
- Submit attempts for objective/manual pathways.
- Auto-score objective answers at submission.
- Apply manual grade, comments, second-review constraints, and rounding/weighting policies.

### 3.6 Messaging Center
- Publish in-app messages with template variables.
- Enforce quiet hours, subscription preferences, and per-user rate limits.
- Retry failed deliveries up to configured threshold and route to dead-letter inbox.
- Track delivery and read timestamps.

### 3.7 Wellness
- Store/retrieve wellness profile inputs.
- Generate nutrition budgets and recommendation explanations.
- Support equivalent meal swaps.

### 3.8 Export/Import
- Export snapshot payload to local file.
- Validate schema on import.
- Validate SHA-256 fingerprint before accepting imported data.

## 4. Error Categories
1. AuthorizationError
- User role/session does not allow requested operation.

2. ValidationError
- Input shape or rule constraints failed.

3. PolicyError
- Operation violates business policy (for example, second-review thresholds).

4. IntegrityError
- Import fingerprint mismatch or schema marker mismatch.

## 5. Data Security Notes
1. Sensitive fields are encrypted before persistence.
2. No external network transport is required for core business flows.
3. Export/import files are treated as untrusted until schema and fingerprint validation pass.
