// app/api/admin/learn/ai-grade/route.ts
import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

interface AIGradeRequest {
  question_text: string;
  reference_answer: string;
  student_answer: string;
  max_points?: number;
}

interface AIGradeResponse {
  score: number;
  max_points: number;
  percentage: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  is_passing: boolean;
}

/* POST — AI-grade an essay/paragraph response */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI grading not configured' }, { status: 503 });
  }

  const body: AIGradeRequest = await req.json();
  const { question_text, reference_answer, student_answer, max_points = 10 } = body;

  if (!question_text || !student_answer) {
    return NextResponse.json({ error: 'question_text and student_answer required' }, { status: 400 });
  }

  // Don't grade empty or trivially short responses
  if (student_answer.trim().length < 10) {
    return NextResponse.json({
      score: 0,
      max_points,
      percentage: 0,
      feedback: 'Your response is too short to evaluate. Please provide a more detailed answer.',
      strengths: [],
      improvements: ['Provide a more thorough and detailed response.'],
      is_passing: false,
    } satisfies AIGradeResponse);
  }

  const systemPrompt = `You are a fair, encouraging grading assistant for a land surveying training program.
Your job is to evaluate a student's written response to a quiz/exam question.

GRADING RULES:
- Grade on a scale of 0 to ${max_points}
- 70% or above is passing
- Be fair but not overly strict — students are learning
- Award partial credit for partially correct answers
- Focus on factual accuracy, completeness, and understanding
- Do not penalize minor grammar or spelling issues
- If the student demonstrates genuine understanding, give generous credit even if wording differs from the reference

RESPONSE FORMAT (strict JSON only, no markdown):
{
  "score": <number 0 to ${max_points}>,
  "feedback": "<2-3 sentence overall evaluation>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<suggestion 1>", "<suggestion 2>"]
}

Keep feedback concise and constructive. Maximum 3 strengths and 3 improvements.`;

  const userPrompt = `QUESTION:
${question_text}

${reference_answer ? `REFERENCE ANSWER (what a good answer should cover):
${reference_answer}

` : ''}STUDENT'S ANSWER:
${student_answer}

Grade this response now. Return ONLY valid JSON.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    const textContent = message.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'AI returned no text response' }, { status: 500 });
    }

    // Parse JSON response from AI
    let parsed: { score: number; feedback: string; strengths: string[]; improvements: string[] };
    try {
      // Strip any markdown code fences if present
      const raw = textContent.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      // If JSON parsing fails, create a fallback response
      return NextResponse.json({
        score: Math.round(max_points * 0.5),
        max_points,
        percentage: 50,
        feedback: textContent.text.substring(0, 300),
        strengths: ['Response was submitted'],
        improvements: ['AI grading encountered a formatting issue — please review manually'],
        is_passing: false,
      } satisfies AIGradeResponse);
    }

    const score = Math.max(0, Math.min(max_points, Math.round(parsed.score)));
    const percentage = Math.round((score / max_points) * 100);

    const result: AIGradeResponse = {
      score,
      max_points,
      percentage,
      feedback: parsed.feedback || 'No feedback available.',
      strengths: (parsed.strengths || []).slice(0, 3),
      improvements: (parsed.improvements || []).slice(0, 3),
      is_passing: percentage >= 70,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('AI grading error:', err);
    return NextResponse.json(
      { error: 'AI grading failed: ' + (err.message || 'Unknown error') },
      { status: 500 }
    );
  }
}, { routeName: 'learn/ai-grade' });
