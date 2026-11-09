/**
 * partnerships.js — System 16: Partnerships & Alliances.
 *
 * Provides:
 *  - Partner directory & alliance registry.
 *  - Application flow for new partner virtual airlines.
 *  - Partner status (active, pending, suspended).
 *  - Discount config & joint alliance benefits.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { writeAudit } from "./ledger.js";

const PARTNERS = "partners";
const APPLICATIONS = "partnerApplications";

export const PARTNER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REJECTED: "rejected",
};

export async function submitPartnerApplication(data) {
  const db = getDb();
  const id = db.collection(APPLICATIONS).doc().id;

  const doc = {
    id,
    applicantUserId: String(data.applicantUserId),
    communityName: String(data.communityName || "").slice(0, 100),
    inviteUrl: String(data.inviteUrl || "").slice(0, 200),
    memberCountEstimate: Math.max(0, Math.floor(Number(data.memberCountEstimate) || 0)),
    notes: String(data.notes || "").slice(0, 500),
    status: PARTNER_STATUS.PENDING,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!doc.communityName) throw new Error("Community name is required.");
  if (!doc.applicantUserId) throw new Error("Applicant User ID is required.");

  await db.collection(APPLICATIONS).doc(id).set(doc);
  return doc;
}

export async function reviewPartnerApplication(applicationId, staffId, decision, { discountPercent = 10, allianceName = "Star Alliance Virtual" } = {}) {
  const db = getDb();
  const appRef = db.collection(APPLICATIONS).doc(applicationId);
  const snap = await appRef.get();
  if (!snap.exists) throw new Error("Application not found.");

  const app = snap.data();
  const isApproved = decision === "approve";
  const newStatus = isApproved ? PARTNER_STATUS.ACTIVE : PARTNER_STATUS.REJECTED;

  await appRef.update({
    status: newStatus,
    reviewedById: staffId,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (isApproved) {
    const partnerRef = db.collection(PARTNERS).doc(applicationId);
    await partnerRef.set({
      id: applicationId,
      communityName: app.communityName,
      inviteUrl: app.inviteUrl,
      representativeUserId: app.applicantUserId,
      allianceName,
      discountPercent: Math.min(50, Math.max(0, Number(discountPercent))),
      status: PARTNER_STATUS.ACTIVE,
      approvedById: staffId,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await writeAudit({
    actorId: staffId,
    action: isApproved ? "approvePartner" : "rejectPartner",
    reason: `Partner application ${decision}d`,
    referenceType: "partnerApplication",
    referenceId: applicationId,
  });

  return { applicationId, status: newStatus };
}

export async function listPartners({ activeOnly = true } = {}) {
  const db = getDb();
  const snap = await db.collection(PARTNERS).get();
  let items = snap.docs.map((d) => d.data());
  if (activeOnly) items = items.filter((p) => p.status === PARTNER_STATUS.ACTIVE);
  return items;
}

export default {
  PARTNER_STATUS,
  submitPartnerApplication,
  reviewPartnerApplication,
  listPartners,
};
