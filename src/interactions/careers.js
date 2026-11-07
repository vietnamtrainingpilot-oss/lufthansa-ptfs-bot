/**
 * careerInteractions.js — Career application interaction handlers.
 */
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import careersService from "../services/careers.js";
import { createTimer } from "../timers/timers.js";
import { buildText } from "../utils/builders.js";

const QUESTION_EXPIRY_MINUTES = 10;

export async function handleCareerDepartmentSelect(interaction, client) {
  if (interaction.customId !== "career_department_select") return;
  const department = interaction.values[0];
  if (!department) return;

  await interaction.deferReply({ flags: 32768, ephemeral: true });
  try {
    await careersService.startApplication(client, interaction.user, department);
    await interaction.editReply(
      buildText("Application started for " + department + ". Check your DMs.")
    );
  } catch (e) {
    console.error("[careers] startApplication failed:", e.message);
    await interaction.editReply({ ...buildText("Failed: " + e.message) });
  }
}

export async function handleCareerAgree(interaction, client) {
  if (!interaction.customId.startsWith("career_agree_")) return;
  const appId = interaction.customId.replace("career_agree_", "");
  const db = getDb();
  const appDoc = await db.collection("careerApplications").doc(appId).get();
  if (!appDoc.exists) return;

  const data = appDoc.data();
  if (data.userId !== interaction.user.id) {
    return interaction.reply({ ...buildText("This is not your application."), ephemeral: true });
  }

  await interaction.update({ content: "Thank you! Starting the application now...", components: [] });
  const questions = careersService.QUESTION_BANKS[data.department] || [];
  await askNextQuestion(appId, 0, questions, client, interaction.user);
}

export async function handleCareerDisagree(interaction, client) {
  if (!interaction.customId.startsWith("career_disagree_")) return;
  const appId = interaction.customId.replace("career_disagree_", "");
  const db = getDb();
  const appDoc = await db.collection("careerApplications").doc(appId).get();
  if (appDoc.exists) {
    await db.collection("careerApplications").doc(appId).update({ status: "cancelled" });
  }
  await interaction.update({
    content: "Your application has been cancelled. You may restart with /careersetup if you change your mind.",
    components: [],
  });
}

async function askNextQuestion(appId, questionIndex, questions, client, user) {
  const db = getDb();
  const appRef = db.collection("careerApplications").doc(appId);
  const appDoc = await appRef.get();
  if (!appDoc.exists) return;
  const data = appDoc.data();

  if (questionIndex >= questions.length) {
    await careersService.submitApplication(appId, client);
    return;
  }

  const questionText = questions[questionIndex];
  const timerId = await createTimer({
    type: "careerQuestionExpiry",
    dueAt: new Date(Date.now() + QUESTION_EXPIRY_MINUTES * 60 * 1000),
    guildId: config.guildIdMain,
    payload: { appId, questionIndex, userId: user.id },
  });

  await appRef.update({ activeTimerId: timerId, currentQuestionIndex: questionIndex });

  try {
    await user.send(
      buildText(
        "**Question " + (questionIndex + 1) + " of " + questions.length + "** (10 min)\n\n" + questionText + "\n\nReply below within 10 minutes."
      )
    );
  } catch (e) {
    console.error("[careers] Could not DM user:", e.message);
    await appRef.update({ status: "denied", reason: "Could not send question via DM" });
  }
}

export async function handleCareerQuestionReply(client, message) {
  if (message.author.bot) return;
  const userId = message.author.id;
  const replyText = message.content.trim();
  if (!replyText) return;

  const db = getDb();
  const appSnap = await db.collection("careerApplications")
    .where("userId", "==", userId)
    .where("status", "==", "in_progress")
    .get();

  if (appSnap.empty) return;
  const appDoc = appSnap.docs[0];
  const data = appDoc.data();
  const appId = appDoc.id;
  const questionIndex = data.currentQuestionIndex || 0;
  const questions = careersService.QUESTION_BANKS[data.department] || [];

  await careersService.recordAnswer(appId, questionIndex, replyText);

  if (data.activeTimerId) {
    try {
      const timerDoc = await db.collection("timers").doc(data.activeTimerId).get();
      if (timerDoc.exists && !timerDoc.data().fired) {
        await db.collection("timers").doc(data.activeTimerId).update({ fired: true });
      }
    } catch (e) { /* ignore */ }
  }

  await askNextQuestion(appId, questionIndex + 1, questions, client, message.author);
}

export async function handleCareerAccept(interaction, client) {
  if (!interaction.customId.startsWith("career_accept_")) return;
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("You do not have permission."), ephemeral: true });
  }
  const appId = interaction.customId.replace("career_accept_", "");
  try {
    await careersService.approveApplication(appId, "Accepted by " + interaction.user.tag, client, interaction.member);
    await interaction.reply({ ...buildText("Application accepted."), ephemeral: true });
  } catch (e) {
    console.error("[careers] approveApplication failed:", e.message);
  }
}

export async function handleCareerDeny(interaction, client) {
  if (!interaction.customId.startsWith("career_deny_")) return;
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("You do not have permission."), ephemeral: true });
  }
  const appId = interaction.customId.replace("career_deny_", "");
  try {
    await careersService.denyApplication(appId, "Denied by staff review", client, interaction.member);
    await interaction.reply({ ...buildText("Application denied."), ephemeral: true });
  } catch (e) {
    console.error("[careers] denyApplication failed:", e.message);
  }
}

export default {
  handleCareerDepartmentSelect,
  handleCareerAgree,
  handleCareerDisagree,
  handleCareerQuestionReply,
  handleCareerAccept,
  handleCareerDeny,
};
