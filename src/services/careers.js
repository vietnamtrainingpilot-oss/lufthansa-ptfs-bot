/**
 * careers.js — Career application service.
 * Handles application flow: department selection, agreement, Q&A, review, accept/deny.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { createTimer } from "../timers/timers.js";
import config from "../config/config.js";
import { ACCENT } from "../config/brand.js";

const COLLECTION = "careerApplications";

const QUESTION_EXPIRY_MINUTES = 10;

const DEPT_TO_ROLE = {
  flight_deck: config.roleFlightDeck,
  cabin_crew: config.roleCabinCrew,
  ground_crew: config.roleGroundCrew,
  flight_operator: config.roleFlightOperator,
  human_resources: config.roleHumanResources,
  public_relations: config.rolePublicRelations,
};

const DEPT_LABELS = {
  flight_deck: "Flight Deck",
  cabin_crew: "Cabin Crew",
  ground_crew: "Ground Crew",
  flight_operator: "Flight Operator",
  human_resources: "Human Resources",
  public_relations: "Public Relations",
};

const QUESTION_BANKS = {
  flight_deck: [
    "Why do you want to be a pilot for Lufthansa PTFS?",
    "What experience do you have with flight simulation or roleplaying?",
    "Describe a time when you had to make a quick decision during a flight. What did you do?",
    "How would you handle a passenger who is not following safety instructions?",
    "What is your understanding of standard aviation communication procedures?",
    "Describe how you would brief passengers before takeoff.",
    "How do you handle in-flight emergencies such as medical situations?",
    "What procedures do you follow during pre-flight checks?",
    "How would you deal with an unresponsive co-pilot mid-flight?",
    "Describe your approach to maintaining professionalism in the cockpit.",
    "What steps would you take if you suspected a security threat onboard?",
    "How do you manage fatigue during long-haul virtual flights?",
    "What is your understanding of crew resource management?",
    "Describe a time when communication breakdown occurred and how you handled it.",
  ],
  cabin_crew: [
    "Why do you want to join the Lufthansa PTFS cabin crew?",
    "How would you handle a difficult or unruly passenger?",
    "Describe your approach to passenger safety announcements.",
    "What would you do if a passenger became ill during the flight?",
    "How do you ensure a welcoming and professional cabin environment?",
    "Describe how you would handle a conflict between two passengers.",
    "What experience do you have in customer service or hospitality?",
    "How would you assist passengers with special needs or disabilities?",
    "Describe your approach to maintaining cabin order during turbulence.",
    "What steps would you take if you noticed a safety hazard in the cabin?",
    "How do you handle feedback or complaints from passengers?",
    "Describe how you would work as part of a cabin crew team.",
  ],
  ground_crew: [
    "Why do you want to join the Lufthansa PTFS ground crew?",
    "Describe your understanding of airport ground operations.",
    "How would you handle a situation where a flight is delayed due to weather?",
    "What steps do you take to ensure passenger boarding runs smoothly?",
    "Describe how you would coordinate with the flight deck during turnaround.",
    "How would you handle an emergency evacuation on the ground?",
    "What experience do you have with ramp operations or aircraft marshalling?",
    "Describe how you would manage lost luggage or baggage issues.",
    "How do you prioritize tasks when multiple flights need attention simultaneously?",
    "What is your approach to maintaining safety around moving aircraft?",
    "Describe a time when you had to solve a problem under pressure.",
    "How would you handle a situation where ground equipment is unavailable?",
    "What steps would you take if a passenger misses their flight?",
  ],
  flight_operator: [
    "Why do you want to become a flight operator for Lufthansa PTFS?",
    "Describe your understanding of flight scheduling and coordination.",
    "How would you handle a last-minute schedule change for a flight?",
    "What steps do you take to ensure a flight is properly staffed?",
    "Describe how you would coordinate between the flight deck and ground crew.",
    "How do you handle conflicting priorities when managing multiple flights?",
    "What experience do you have with air traffic coordination or dispatching?",
    "Describe how you would communicate delays or cancellations to passengers.",
    "How do you ensure compliance with internal policies and procedures?",
    "What is your approach to gathering and relaying accurate flight information?",
    "Describe a time when you managed a complex scheduling challenge.",
    "How would you handle a situation where a pilot cancels at the last minute?",
    "What tools or methods do you use to stay organized during operations?",
    "Describe your approach to post-flight reporting and documentation.",
    "How do you ensure a smooth handoff between pre-flight and post-flight stages?",
  ],
  human_resources: [
    "Why do you want to join the Lufthansa PTFS Human Resources department?",
    "Describe your approach to handling sensitive employee information.",
    "How would you process a new career application from start to finish?",
    "What steps do you take to ensure fair and consistent recruitment?",
    "Describe how you would handle a conflict between two staff members.",
    "How do you approach onboarding new team members into the airline?",
    "What experience do you have with policy development or implementation?",
    "Describe how you would handle a staff complaint or grievance.",
    "How do you ensure that departmental roles and responsibilities are clearly defined?",
    "What is your approach to performance evaluations or staff reviews?",
    "Describe a time when you improved a process or system.",
    "How would you handle a situation where a staff member violates company policy?",
    "What steps do you take to keep staff informed about updates and changes?",
    "Describe your approach to building a positive team culture.",
    "How do you balance efficiency with empathy in HR decisions?",
  ],
  public_relations: [
    "Why do you want to join the Lufthansa PTFS Public Relations department?",
    "Describe your approach to communicating important announcements to the community.",
    "How would you handle a negative situation or crisis in the community?",
    "What steps do you take to ensure accurate and timely information dissemination?",
    "Describe how you would promote a new route or event for the airline.",
    "How do you approach building and maintaining relationships with partner airlines?",
    "What experience do you have with social media or community management?",
    "Describe how you would write a press release or official announcement.",
    "How do you handle sensitive or potentially controversial topics in public communications?",
    "What is your approach to gathering feedback from the community?",
    "Describe a time when you successfully managed a public-facing project.",
    "How would you coordinate with other departments for promotional content?",
    "What steps do you take to maintain the airline's brand image and consistency?",
    "Describe how you would handle misinformation or rumors in the community.",
    "How do you prioritize which stories or announcements to feature publicly?",
  ],
};

export async function startApplication(client, user, department) {
  const db = getDb();
  const appId = db.collection(COLLECTION).doc().id;
  const deptLabel = DEPT_LABELS[department] || department;
  const questionCount = QUESTION_BANKS[department]?.length || 0;

  const applicationData = {
    id: appId,
    userId: user.id,
    department,
    status: "in_progress",
    answers: [],
    reviewerId: null,
    reason: null,
    createdAt: new Date(),
    decidedAt: null,
    departmentEnabled: true,
  };
  await db.collection(COLLECTION).doc(appId).set(applicationData);

  try {
    const agreementMsg = {
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: ACCENT.CAREERS,
          components: [
            {
              type: 10,
              content: "## Application Agreements\n> Welcome to the " + deptLabel + ". This test consists of " + questionCount + " questions, all of which are written. Each questions are needed to be completed in 10 minutes. Please answer as detailed as possible, as it might require some effort into it. AI Usage is prohibited in this application.",
            },
            { type: 14 },
            {
              type: 1,
              components: [
                { type: 2, style: 3, label: "Agree", custom_id: "career_agree_" + appId },
                { type: 2, style: 4, label: "Disagree", custom_id: "career_disagree_" + appId },
              ],
            },
          ],
        },
      ],
    };
    await user.send(agreementMsg);
  } catch (e) {
    console.error("[careers] Could not DM user:", e.message);
  }

  return applicationData;
}

export async function recordAnswer(appId, questionIndex, answerText) {
  const db = getDb();
  const appRef = db.collection(COLLECTION).doc(appId);
  const appDoc = await appRef.get();
  if (!appDoc.exists) throw new Error("Application not found");

  const department = appDoc.data().department;
  const questions = QUESTION_BANKS[department] || [];
  const questionText = questions[questionIndex] || "Question " + (questionIndex + 1);

  await appRef.update({
    answers: admin.firestore.FieldValue.arrayUnion({
      questionIndex,
      questionText,
      answerText,
      answeredAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
  });
}

export async function submitApplication(appId, client) {
  const db = getDb();
  const appRef = db.collection(COLLECTION).doc(appId);
  const appDoc = await appRef.get();
  if (!appDoc.exists) throw new Error("Application not found");

  const data = appDoc.data();
  const deptLabel = DEPT_LABELS[data.department] || data.department;

  await appRef.update({ status: "pending_review" });

  const answersText = data.answers
    .map((a) => "**Q" + (a.questionIndex + 1) + ":** " + a.questionText + "\nA: " + a.answerText + "\n")
    .join("\n\n");

  const reviewContent = "## Application for " + deptLabel + "\n```" + data.userId + "```\n\n" + answersText;

  try {
    const reviewChannel = await client.channels.fetch(config.careerReviewChannelId);
    if (!reviewChannel || !reviewChannel.isTextBased()) {
      throw new Error("Review channel not found or invalid");
    }
    const msg = await reviewChannel.send({
      flags: 32768,
      content: reviewContent.slice(0, 1900),
      components: [
        {
          type: 17,
          accent_color: ACCENT.CAREERS,
          components: [
            { type: 10, content: "## Application Review\n> Please review the application above and choose Accept or Deny." },
            { type: 14 },
            {
              type: 1,
              components: [
                { type: 2, style: 3, label: "Accept", custom_id: "career_accept_" + appId },
                { type: 2, style: 4, label: "Deny", custom_id: "career_deny_" + appId },
              ],
            },
          ],
        },
      ],
    });
    await appRef.update({ reviewMessageId: msg.id });
  } catch (e) {
    console.error("[careers] Failed to post to review channel:", e.message);
  }

  try {
    const user = await client.users.fetch(data.userId);
    const recordedMsg = {
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: ACCENT.CAREERS,
          components: [
            {
              type: 10,
              content: "## Application Recorded \n> Thank you for spending your time applying for this position. We will soon grade your application and results will be announced to you soon. Application results will be directed to you and sent in <#" + config.careerResultsAnnounceChannelId + "> also.\n\n> Please give us at least 48-72 hours to reach and grade your application. Thank you for your patience.",
            },
          ],
        },
      ],
    };
    await user.send(recordedMsg);
  } catch (e) {
    console.log("[careers] Could not DM applicant:", e.message);
  }

  return { ...data, id: appId };
}

export async function approveApplication(appId, reason, client, reviewer) {
  const db = getDb();
  const appRef = db.collection(COLLECTION).doc(appId);
  const appDoc = await appRef.get();
  if (!appDoc.exists) throw new Error("Application not found");

  const data = appDoc.data();
  const deptLabel = DEPT_LABELS[data.department] || data.department;
  const roleToAssign = DEPT_TO_ROLE[data.department];

  if (roleToAssign) {
    try {
      const mainGuild = await client.guilds.fetch(config.guildIdMain);
      const member = await mainGuild.members.fetch(data.userId).catch(() => null);
      if (member && !member.roles.cache.has(roleToAssign)) {
        await member.roles.add(roleToAssign);
      }
    } catch (e) {
      console.error("[careers] Role assignment failed:", e.message);
    }
  }

  await appRef.update({
    status: "accepted",
    reviewerId: reviewer.id,
    reason: null,
    decidedAt: new Date(),
  });

  try {
    const user = await client.users.fetch(data.userId);
    const acceptMsg = {
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: ACCENT.CAREERS,
          components: [
            {
              type: 10,
              content: "## Application accepted\n> Hello " + user.tag + ". After consideration from the training department and the flight operations department, we are excited to announce that your application has been accepted.\n\n Application Type: **" + deptLabel + "**\n\n> Please head to the training program to proceed your training. If you need any help, please contact the support team via <#" + config.supportContactChannelId + ">. Thanks for applying and welcome to the team",
            },
          ],
        },
      ],
    };
    await user.send(acceptMsg);
  } catch (e) {
    console.log("[careers] Could not DM applicant:", e.message);
  }

  try {
    if (appDoc.data().reviewMessageId) {
      const reviewChannel = await client.channels.fetch(config.careerReviewChannelId);
      const msg = await reviewChannel.messages.fetch(appDoc.data().reviewMessageId).catch(() => null);
      if (msg) {
        await msg.edit({
          content: "## Application Accepted\n" + data.userId + "\n**Department:** " + deptLabel + "\n**Reviewer:** " + reviewer.user.tag + "\n\n> Application has been accepted. Role assigned.",
          components: [],
        });
      }
    }
  } catch (e) {
    console.error("[careers] Failed to update review message:", e.message);
  }
}

export async function denyApplication(appId, reason, client, reviewer) {
  const db = getDb();
  const appRef = db.collection(COLLECTION).doc(appId);
  const appDoc = await appRef.get();
  if (!appDoc.exists) throw new Error("Application not found");

  const data = appDoc.data();
  const deptLabel = DEPT_LABELS[data.department] || data.department;

  await appRef.update({
    status: "denied",
    reviewerId: reviewer.id,
    reason,
    decidedAt: new Date(),
  });

  try {
    const user = await client.users.fetch(data.userId);
    const denyMsg = {
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: ACCENT.CAREERS,
          components: [
            {
              type: 10,
              content: "# Application Denied\n> Hello " + user.tag + ". After consideration from the training department and the flight operations department, we are sadly to announce that your application has been denied.\n\n Application Type: **" + deptLabel + "**\n Reason: **" + reason + "**\n\n> You may reapply within 24 hours. If you need any help, please contact the support team via <#" + config.supportContactChannelId + ">. Thanks for your time in the application.",
            },
          ],
        },
      ],
    };
    await user.send(denyMsg);
  } catch (e) {
    console.log("[careers] Could not DM applicant:", e.message);
  }

  try {
    if (appDoc.data().reviewMessageId) {
      const reviewChannel = await client.channels.fetch(config.careerReviewChannelId);
      const msg = await reviewChannel.messages.fetch(appDoc.data().reviewMessageId).catch(() => null);
      if (msg) {
        await msg.edit({
          content: "## Application Denied\n" + data.userId + "\n**Department:** " + deptLabel + "\n**Reviewer:** " + reviewer.user.tag + "\n**Reason:** " + reason + "\n\n> Application has been denied.",
          components: [],
        });
      }
    }
  } catch (e) {
    console.error("[careers] Failed to update review message:", e.message);
  }
}

export default {
  QUESTION_BANKS,
  DEPT_TO_ROLE,
  DEPT_LABELS,
  QUESTION_EXPIRY_MINUTES,
  startApplication,
  recordAnswer,
  submitApplication,
  approveApplication,
  denyApplication,
};
