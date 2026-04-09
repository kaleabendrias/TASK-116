import { describe, it, expect } from 'vitest';
import { STORE_VALIDATORS } from '@domain/export/storeSchemas';

describe('STORE_VALIDATORS', () => {
  describe('questions', () => {
    const v = STORE_VALIDATORS.questions;
    it('accepts a well-formed question', () => {
      expect(v({
        id: 'q1', type: 'single_choice', prompt: 'p', choices: [], correctChoiceIds: [],
        difficulty: 1, maxScore: 10, tags: [], knowledgePoints: [], applicableDepartments: [],
        status: 'active'
      })).toBeNull();
    });
    it('rejects bad type and bad status', () => {
      expect(v({ id: 'q', type: 'unknown', prompt: 'p', choices: [], correctChoiceIds: [],
        difficulty: 1, maxScore: 10, tags: [], knowledgePoints: [], applicableDepartments: [],
        status: 'active' })).toMatch(/type/);
      expect(v({ id: 'q', type: 'short_answer', prompt: 'p', choices: [], correctChoiceIds: [],
        difficulty: 1, maxScore: 10, tags: [], knowledgePoints: [], applicableDepartments: [],
        status: 'limbo' })).toMatch(/status/i);
      // Legacy generic 'text' type is no longer accepted at the snapshot
      // boundary — only the explicit short_answer taxonomy is allowed.
      expect(v({ id: 'q', type: 'text', prompt: 'p', choices: [], correctChoiceIds: [],
        difficulty: 1, maxScore: 10, tags: [], knowledgePoints: [], applicableDepartments: [],
        status: 'active' })).toMatch(/type/);
    });
    it('rejects non-objects', () => {
      expect(v(null)).toBeTruthy();
      expect(v(42)).toBeTruthy();
      expect(v([])).toBeTruthy();
    });
    it('reports the first missing field', () => {
      expect(v({ id: 'q' })).toBeTruthy();
    });
  });

  describe('attempts', () => {
    const v = STORE_VALIDATORS.attempts;
    it('accepts and rejects', () => {
      expect(v({ id: 'a', userId: 'u', questionId: 'q', needsManualGrading: false, submittedAt: 1 })).toBeNull();
      expect(v({ id: 'a' })).toBeTruthy();
      expect(v(null)).toBeTruthy();
    });
  });

  describe('grades', () => {
    const v = STORE_VALIDATORS.grades;
    it('accepts and rejects', () => {
      expect(v({
        id: 'g', attemptId: 'a', questionId: 'q', graderId: 'u',
        firstScore: 50, awaitingSecondReview: true, finalScore: null, createdAt: 0, updatedAt: 0
      })).toBeNull();
      expect(v({
        id: 'g', attemptId: 'a', questionId: 'q', graderId: 'u',
        firstScore: 50, awaitingSecondReview: true, finalScore: 'high', createdAt: 0, updatedAt: 0
      })).toMatch(/finalScore/);
      expect(v(null)).toBeTruthy();
    });
  });

  describe('messages + dead letters', () => {
    const v = STORE_VALIDATORS.messages;
    it('accepts and rejects', () => {
      expect(v({ id: 'm', fromUserId: 'a', toUserId: 'b', category: 'system',
        attempts: 0, status: 'pending', createdAt: 1 })).toBeNull();
      expect(v({ id: 'm' })).toBeTruthy();
    });
  });

  describe('healthProfiles', () => {
    const v = STORE_VALIDATORS.healthProfiles;
    it('accepts the basic shape', () => {
      expect(v({ id: 'u', userId: 'u', updatedAt: 1 })).toBeNull();
      expect(v({ id: 'u' })).toBeTruthy();
    });
  });

  describe('catalogs', () => {
    const v = STORE_VALIDATORS.catalogs;
    it('passes config records with valid sampleType', () => {
      expect(v({
        id: 'cfgrec:r1',
        record: {
          id: 'r1', name: 'X', device: 'Y', department: 'Z', project: 'P',
          sampleQueue: 'Q', sampleType: 'blood', tags: [],
          effectiveFrom: '01/01/2026', effectiveTo: '12/31/2026',
          priceUsd: 10, valid: true
        }
      })).toBeNull();
    });
    it('rejects invalid sampleType', () => {
      expect(v({
        id: 'cfgrec:r1',
        record: {
          id: 'r1', name: 'X', device: 'Y', department: 'Z', project: 'P',
          sampleQueue: 'Q', sampleType: 'unicorn', tags: [],
          effectiveFrom: '01/01/2026', effectiveTo: '12/31/2026',
          priceUsd: 10, valid: true
        }
      })).toMatch(/sampleType/);
    });
    it('rejects missing record fields', () => {
      expect(v({ id: 'cfgrec:r1', record: { id: 'r1' } })).toBeTruthy();
      expect(v({ id: 'cfgrec:r1' })).toMatch(/record/);
    });
    it('passes non-config envelopes (subscriptions, seed flags)', () => {
      expect(v({ id: 'sub:user', data: {} })).toBeNull();
      expect(v({ id: 'seed-flag', seededAt: 1 })).toBeNull();
    });
    it('rejects non-objects and missing ids', () => {
      expect(v(null)).toBeTruthy();
      expect(v({})).toBeTruthy();
    });
  });

  describe('trips', () => {
    const v = STORE_VALIDATORS.trips;
    it('accepts a complete trip and rejects partial ones', () => {
      expect(v({
        id: 't1', name: 'A', origin: 'O', destination: 'D',
        departureAt: 1, rows: 8, cols: 4, createdBy: 'u', createdAt: 1
      })).toBeNull();
      expect(v({ id: 't1' })).toBeTruthy();
      expect(v({})).toBeTruthy();
      expect(v(null)).toBeTruthy();
    });
  });

  describe('seats / holds / bookings', () => {
    it('accepts well-formed seats and rejects partial ones', () => {
      const v = STORE_VALIDATORS.seats;
      expect(v({ id: 't:1A', tripId: 't', seatId: '1A', label: '1A', row: 1, column: 0, kind: 'standard' })).toBeNull();
      expect(v({ id: 't:1A', tripId: 't', seatId: '1A', label: '1A', row: 1, column: 0, kind: 'unknown' })).toMatch(/kind/);
      expect(v(null)).toBeTruthy();
    });
    it('accepts well-formed holds and rejects partial ones', () => {
      const v = STORE_VALIDATORS.holds;
      expect(v({ id: 't:1A', tripId: 't', seatId: '1A', ownerTabId: 'tab', expiresAt: 1 })).toBeNull();
      expect(v({ id: 't:1A' })).toBeTruthy();
      expect(v(null)).toBeTruthy();
    });
    it('accepts well-formed bookings and rejects partial ones', () => {
      const v = STORE_VALIDATORS.bookings;
      expect(v({ id: 't:1A', tripId: 't', seatId: '1A', bookedAt: 1 })).toBeNull();
      expect(v({ id: 't:1A' })).toBeTruthy();
      expect(v(null)).toBeTruthy();
    });
  });
});
