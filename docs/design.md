# Design Document - TransitOps Training & Dispatch SPA

## 1. System Overview
TransitOps is a browser-first operational platform that combines dispatch seat control, operational configuration management, assessment readiness, wellness policy support, and in-app messaging. The solution is intentionally implemented as an offline-capable frontend SPA to keep all operational workflows available without backend dependency.

## 2. Goals
1. Provide role-based workspaces for Administrator, Dispatcher, Content Author, and Reviewer/Grader.
2. Prevent local overselling through seat hold timers and auto-release behavior across browser tabs.
3. Support configurable operational associations with effective date handling and validity flags.
4. Deliver a full question and grading lifecycle including second-review governance.
5. Enforce sensitive-data encryption at rest in browser persistence.

## 3. Architecture
The application follows a layered design:

1. UI Layer (Svelte)
- Routes, forms, table/editing interactions, drawers, and modal workflows.

2. Application Service Layer
- Coordinates business use-cases and permission checks.
- Bridges UI events to domain logic and persistence adapters.

3. Domain Layer
- Pure business rules and validators (no I/O).
- Includes scoring policy, config/date rules, seat behavior, and export schemas.

4. Persistence Layer
- IndexedDB for core records: trips, seats, holds, questions, attempts, grades, config catalogs.
- localStorage for lightweight user preferences.

## 4. Security Model
1. Pseudo-login using local usernames with salted password hashes.
2. Role-based route and action authorization.
3. Sensitive fields (health preferences and grader notes) encrypted at rest using Web Crypto.
4. Export/import tamper detection using SHA-256 fingerprinting.

## 5. Key Domain Workflows
### 5.1 Trips and Seat Control
- Seat maps support selectable and blocked seats.
- Hold operation starts a 10-minute reservation timer.
- Expired holds auto-release to prevent stale inventory locking.

### 5.2 Operational Configuration
- Admin-managed Department/Device/Project associations.
- Effective-date windows with default expired-row hiding.
- Inline table edits plus detail drawer for full context.

### 5.3 Question and Grading Lifecycle
- Create/edit/copy/deactivate/soft-delete/restore question flows.
- Objective auto-scoring on submit.
- Manual grading with partial credit and policy-bound second review.

### 5.4 Messaging and Notification Center
- In-app only delivery.
- Template variables, quiet hours, retry logic, dead-letter handling, read timestamps, and rate limiting.

### 5.5 Wellness Policy Support
- Optional profile capture for age range, activity, allergens, and goals.
- Recommendation output includes reason transparency and swap alternatives.

## 6. Non-Functional Considerations
1. Offline-first operation with browser-local persistence.
2. Predictable behavior across tabs for high-contention seat actions.
3. Deterministic rule enforcement through domain-first validation.
4. Maintainability through strict separation of concerns.
