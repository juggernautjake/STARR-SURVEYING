// lib/notifications.ts — Centralized notification creation utility
// Call these helpers from any API route to create properly formatted notifications.
// All notifications are inserted into the `notifications` table.

import { supabaseAdmin } from '@/lib/supabase';

interface NotifyOptions {
  user_email: string;
  type: string;
  title: string;
  body?: string;
  icon?: string;
  link?: string;
  source_type?: string;
  source_id?: string;
  escalation_level?: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
  thread_id?: string;
}

/** Insert a single notification */
export async function notify(opts: NotifyOptions) {
  await supabaseAdmin.from('notifications').insert({
    user_email: opts.user_email,
    type: opts.type,
    title: opts.title,
    body: opts.body || null,
    icon: opts.icon || null,
    link: opts.link || null,
    source_type: opts.source_type || null,
    source_id: opts.source_id || null,
    escalation_level: opts.escalation_level || 'normal',
    thread_id: opts.thread_id || null,
  });
}

/** Insert notifications for multiple users at once */
export async function notifyMany(users: string[], base: Omit<NotifyOptions, 'user_email'>) {
  if (users.length === 0) return;
  const rows = users.map(email => ({
    user_email: email,
    type: base.type,
    title: base.title,
    body: base.body || null,
    icon: base.icon || null,
    link: base.link || null,
    source_type: base.source_type || null,
    source_id: base.source_id || null,
    escalation_level: base.escalation_level || 'normal',
    thread_id: base.thread_id || null,
  }));
  await supabaseAdmin.from('notifications').insert(rows);
}

// ─── Convenience helpers for specific event types ─────────────────────────────

/** Lesson or module completed */
export async function notifyLessonComplete(userEmail: string, lessonTitle: string, moduleTitle: string) {
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `✅ Lesson Complete: ${lessonTitle}`,
    body: `Great work finishing "${lessonTitle}" in ${moduleTitle}!`,
    icon: '✅',
    link: '/admin/learn/roadmap',
    source_type: 'lesson_complete',
  });
}

export async function notifyModuleComplete(userEmail: string, moduleTitle: string) {
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `🎓 Module Complete: ${moduleTitle}`,
    body: `You've completed all lessons in "${moduleTitle}"! Keep up the great work.`,
    icon: '🎓',
    link: '/admin/learn/roadmap',
    source_type: 'module_complete',
  });
}

/** Quiz/exam passed or failed */
export async function notifyQuizResult(userEmail: string, quizTitle: string, score: number, passed: boolean) {
  const icon = passed ? '🏆' : '📝';
  const verb = passed ? 'Passed' : 'Did not pass';
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `${icon} ${verb}: ${quizTitle}`,
    body: `Score: ${score}%. ${passed ? 'Great job!' : 'Keep studying and try again!'}`,
    icon,
    link: '/admin/learn/quiz-history',
    source_type: 'quiz_result',
  });
}

/** New article published */
export async function notifyNewArticle(recipientEmails: string[], articleTitle: string, articleId: string) {
  await notifyMany(recipientEmails, {
    type: 'info',
    title: `📰 New Article: ${articleTitle}`,
    body: `A new knowledge base article has been published.`,
    icon: '📰',
    link: `/admin/learn/knowledge-base/${articleId}`,
    source_type: 'new_article',
    source_id: articleId,
  });
}

/** Job assignment */
export async function notifyJobAssignment(userEmail: string, jobNumber: string, jobName: string, jobId: string) {
  await notify({
    user_email: userEmail,
    type: 'assignment',
    title: `🔧 Assigned to Job: ${jobNumber}`,
    body: `You've been assigned to "${jobName}".`,
    icon: '🔧',
    link: `/admin/jobs/${jobId}`,
    source_type: 'job_assignment',
    source_id: jobId,
    escalation_level: 'high',
  });
}

/** Task assignment */
export async function notifyTaskAssignment(userEmail: string, taskTitle: string, assignmentId: string, priority: string) {
  const escalation = priority === 'urgent' ? 'urgent' : priority === 'high' ? 'high' : 'normal';
  await notify({
    user_email: userEmail,
    type: 'assignment',
    title: `📋 New Assignment: ${taskTitle}`,
    body: `Priority: ${priority}`,
    icon: '📋',
    link: '/admin/assignments',
    source_type: 'task_assignment',
    source_id: assignmentId,
    escalation_level: escalation,
  });
}

/** Payment update */
export async function notifyPaymentUpdate(userEmail: string, title: string, body: string) {
  await notify({
    user_email: userEmail,
    type: 'payment',
    title: `💰 ${title}`,
    body,
    icon: '💰',
    link: '/admin/my-pay',
    source_type: 'payment',
    escalation_level: 'normal',
  });
}

/** Hours approved or denied */
export async function notifyHoursDecision(userEmail: string, approved: boolean, date: string, hours: number) {
  const status = approved ? 'Approved' : 'Denied';
  const icon = approved ? '✅' : '❌';
  await notify({
    user_email: userEmail,
    type: 'approval',
    title: `${icon} Hours ${status}`,
    body: `${hours}h for ${date} have been ${status.toLowerCase()}.`,
    icon,
    link: '/admin/my-hours',
    source_type: 'hours_decision',
  });
}

/** Raise notification */
export async function notifyRaise(userEmail: string, newRate: string) {
  await notify({
    user_email: userEmail,
    type: 'payment',
    title: `🎉 You got a raise!`,
    body: `Your new rate is ${newRate}. Keep up the great work!`,
    icon: '🎉',
    link: '/admin/my-pay',
    source_type: 'raise',
    escalation_level: 'normal',
  });
}

/** Bonus awarded */
export async function notifyBonus(userEmail: string, amount: string, reason: string) {
  await notify({
    user_email: userEmail,
    type: 'payment',
    title: `🎊 Bonus Awarded: ${amount}`,
    body: reason,
    icon: '🎊',
    link: '/admin/my-pay',
    source_type: 'bonus',
  });
}

/** Rewards store purchase confirmation */
export async function notifyPurchase(userEmail: string, itemName: string, xpSpent: number) {
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `🛍️ Purchase Confirmed: ${itemName}`,
    body: `${xpSpent.toLocaleString()} XP spent. An admin will fulfill your order.`,
    icon: '🛍️',
    link: '/admin/rewards',
    source_type: 'purchase',
  });
}

/** New reward or product in store */
export async function notifyNewReward(recipientEmails: string[], itemName: string, xpCost: number) {
  await notifyMany(recipientEmails, {
    type: 'info',
    title: `🆕 New in Store: ${itemName}`,
    body: `Available for ${xpCost.toLocaleString()} XP. Check it out!`,
    icon: '🆕',
    link: '/admin/rewards',
    source_type: 'new_reward',
  });
}

/** Badge earned */
export async function notifyBadgeEarned(userEmail: string, badgeName: string, badgeIcon: string) {
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `${badgeIcon} Badge Earned: ${badgeName}`,
    body: `Congratulations! You've earned the "${badgeName}" badge.`,
    icon: badgeIcon,
    link: '/admin/rewards',
    source_type: 'badge_earned',
  });
}

/** Celebratory — employee certification, birthday, etc. */
export async function notifyCelebration(recipientEmails: string[], title: string, body: string) {
  await notifyMany(recipientEmails, {
    type: 'info',
    title: `🎉 ${title}`,
    body,
    icon: '🎉',
    link: '/admin/dashboard',
    source_type: 'celebration',
  });
}

/** Study reminder — flashcards due, refresh material */
export async function notifyStudyReminder(userEmail: string, title: string, body: string, link: string) {
  await notify({
    user_email: userEmail,
    type: 'reminder',
    title: `⏰ ${title}`,
    body,
    icon: '⏰',
    link,
    source_type: 'study_reminder',
  });
}

/** Promotion */
export async function notifyPromotion(userEmail: string, newRole: string) {
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `🌟 Congratulations on your promotion!`,
    body: `You've been promoted to ${newRole}.`,
    icon: '🌟',
    link: '/admin/profile',
    source_type: 'promotion',
    escalation_level: 'normal',
  });
}

/** Job stage update */
export async function notifyJobStageUpdate(recipientEmails: string[], jobNumber: string, jobId: string, fromStage: string, toStage: string) {
  await notifyMany(recipientEmails, {
    type: 'job_update',
    title: `🔄 Job ${jobNumber}: ${fromStage} → ${toStage}`,
    body: `Job stage updated.`,
    icon: '🔄',
    link: `/admin/jobs/${jobId}`,
    source_type: 'job_stage',
    source_id: jobId,
  });
}

/** Direct admin notification (urgent, from admin) */
export async function notifyFromAdmin(userEmail: string, title: string, body: string, link?: string) {
  await notify({
    user_email: userEmail,
    type: 'system',
    title: `📢 ${title}`,
    body,
    icon: '📢',
    link: link || '/admin/dashboard',
    source_type: 'admin_direct',
    escalation_level: 'urgent',
  });
}

/** XP earned */
export async function notifyXPEarned(userEmail: string, amount: number, reason: string) {
  await notify({
    user_email: userEmail,
    type: 'info',
    title: `⭐ +${amount} XP Earned`,
    body: reason,
    icon: '⭐',
    link: '/admin/rewards',
    source_type: 'xp_earned',
  });
}
