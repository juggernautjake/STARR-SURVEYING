// app/api/admin/learn/roadmap/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userEmail = session.user.email;

  // Fetch all modules ordered by order_index
  const { data: modules } = await supabaseAdmin.from('learning_modules')
    .select('*').order('order_index');

  // Fetch the user's lesson progress
  const { data: lessonProgress } = await supabaseAdmin.from('user_lesson_progress')
    .select('*').eq('user_email', userEmail);

  // Fetch milestones (table might not exist yet)
  let milestones: {
    id: string;
    title: string;
    description: string;
    milestone_type: string;
    part_number: number;
    required_module_ids: string[];
    order_index: number;
    icon: string;
    color: string;
  }[] = [];
  try {
    const { data } = await supabaseAdmin.from('curriculum_milestones')
      .select('*').order('order_index');
    milestones = data || [];
  } catch {
    // Table might not exist yet
  }

  // Fetch user milestone progress (table might not exist yet)
  let milestoneProgress: {
    user_email: string;
    milestone_id: string;
    achieved_at: string;
  }[] = [];
  try {
    const { data } = await supabaseAdmin.from('user_milestone_progress')
      .select('*').eq('user_email', userEmail);
    milestoneProgress = data || [];
  } catch {
    // Table might not exist yet
  }

  const progressList = lessonProgress || [];
  const moduleList = modules || [];

  // For each module, calculate progress
  const modulesWithProgress = await Promise.all(
    moduleList.map(async (mod: { id: string; title: string; order_index: number; [key: string]: unknown }) => {
      // Get total lesson count for this module
      const { data: lessons } = await supabaseAdmin.from('learning_lessons')
        .select('id', { count: 'exact' }).eq('module_id', mod.id);

      const totalLessons = lessons?.length || 0;

      // Count completed lessons from user progress
      const completedLessons = progressList.filter(
        (p: { module_id: string; status: string }) => p.module_id === mod.id && p.status === 'completed'
      ).length;

      const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        ...mod,
        total_lessons: totalLessons,
        completed_lessons: completedLessons,
        percentage,
      };
    })
  );

  // Build a lookup of module completion percentages
  const moduleCompletionMap = new Map<string, number>();
  for (const mod of modulesWithProgress) {
    moduleCompletionMap.set(mod.id, mod.percentage);
  }

  // For each milestone, check if all required modules are 100% complete
  const achievedMilestoneIds = new Set<string>(
    milestoneProgress.map((mp: { milestone_id: string }) => mp.milestone_id)
  );

  const milestonesWithStatus = milestones.map(
    (ms: { id: string; required_module_ids: string[]; [key: string]: unknown }) => {
      const requiredIds: string[] = ms.required_module_ids || [];
      const allComplete = requiredIds.length > 0 && requiredIds.every(
        (modId: string) => moduleCompletionMap.get(modId) === 100
      );
      const achieved = achievedMilestoneIds.has(ms.id);
      const achievedEntry = milestoneProgress.find(
        (mp: { milestone_id: string }) => mp.milestone_id === ms.id
      );

      return {
        ...ms,
        all_modules_complete: allComplete,
        achieved,
        achieved_at: achievedEntry ? achievedEntry.achieved_at : null,
      };
    }
  );

  // Calculate overall progress
  const totalModules = modulesWithProgress.length;
  const completedModules = modulesWithProgress.filter(
    (m: { percentage: number }) => m.percentage === 100
  ).length;
  const totalLessons = modulesWithProgress.reduce(
    (sum: number, m: { total_lessons: number }) => sum + m.total_lessons, 0
  );
  const completedLessons = modulesWithProgress.reduce(
    (sum: number, m: { completed_lessons: number }) => sum + m.completed_lessons, 0
  );
  const overallPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return NextResponse.json({
    modules: modulesWithProgress,
    milestones: milestonesWithStatus,
    overall_progress: {
      total_modules: totalModules,
      completed_modules: completedModules,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      percentage: overallPercentage,
    },
  });
}, { routeName: 'learn/roadmap' });
