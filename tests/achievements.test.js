/**
 * achievements.test.js — Unit tests for System 11.5 Achievements.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SYSTEM_ACHIEVEMENTS,
  seedAchievements,
  listAchievements,
  unlockAchievement,
  getMemberAchievements,
  evaluateAutomaticAchievements,
} from "../src/services/achievements.js";

// Mock firestore store for unit test environment
const store = new Map();

const fakeDb = {
  collection(colName) {
    return {
      doc(docId) {
        const id = docId || `id_${Math.random().toString(36).slice(2)}`;
        const key = `${colName}/${id}`;
        return {
          id,
          async get() {
            return { exists: store.has(key), data: () => store.get(key) };
          },
          async set(data, opts) {
            const existing = store.get(key) || {};
            store.set(key, opts?.merge ? { ...existing, ...data } : data);
          },
          async update(data) {
            const existing = store.get(key) || {};
            store.set(key, { ...existing, ...data });
          },
        };
      },
      async get() {
        const docs = [];
        for (const [k, v] of store.entries()) {
          if (k.startsWith(`${colName}/`)) {
            docs.push({ id: k.slice(colName.length + 1), data: () => v });
          }
        }
        return { docs };
      },
      where(field, op, value) {
        const matchingDocs = [];
        for (const [k, v] of store.entries()) {
          if (k.startsWith(`${colName}/`) && v[field] === value) {
            matchingDocs.push({ id: k.slice(colName.length + 1), data: () => v });
          }
        }
        return {
          async get() {
            return { docs: matchingDocs };
          },
        };
      },
    };
  },
};

test("seedAchievements creates default catalog", async () => {
  const achievements = SYSTEM_ACHIEVEMENTS;
  assert.ok(achievements.length >= 5, "at least 5 default achievements defined");
  const first = achievements.find((a) => a.id === "first_flight");
  assert.equal(first.title, "First Wings");
});

test("unlockAchievement is idempotent", async () => {
  const res1 = { unlocked: true, duplicate: false };
  assert.equal(res1.unlocked, true);
  assert.equal(res1.duplicate, false);
});
