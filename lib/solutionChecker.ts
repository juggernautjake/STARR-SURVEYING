// lib/solutionChecker.ts — Answer validation with intelligent rounding tolerance
// Handles numeric answers, rounding differences, and provides detailed feedback

export interface CheckResult {
  is_correct: boolean;
  is_close: boolean; // true if answer is close but not exact (rounding difference)
  user_answer: string;
  correct_answer: string;
  difference: number | null;
  feedback: string;
  rounding_warning?: string;
}

/**
 * Check a numeric answer with intelligent rounding tolerance.
 *
 * @param userAnswer - The student's answer as a string
 * @param correctAnswer - The correct answer as a string
 * @param tolerance - Absolute tolerance for exact match (default 0.01)
 * @param closeTolerance - Extended tolerance for "close" answers (rounding, default 5x tolerance)
 */
export function checkNumericAnswer(
  userAnswer: string,
  correctAnswer: string,
  tolerance: number = 0.01,
  closeTolerance?: number
): CheckResult {
  const userNum = parseFloat(userAnswer?.trim());
  const correctNum = parseFloat(correctAnswer?.trim());

  if (isNaN(userNum)) {
    return {
      is_correct: false,
      is_close: false,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      difference: null,
      feedback: 'Your answer is not a valid number. Please enter a numeric value.',
    };
  }

  if (isNaN(correctNum)) {
    return {
      is_correct: false,
      is_close: false,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      difference: null,
      feedback: 'Error: correct answer is not numeric.',
    };
  }

  const diff = Math.abs(userNum - correctNum);
  const effectiveCloseTolerance = closeTolerance ?? Math.max(tolerance * 5, 0.05);

  // Exact match (within tolerance)
  if (diff <= tolerance) {
    return {
      is_correct: true,
      is_close: false,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      difference: diff,
      feedback: 'Correct!',
    };
  }

  // Close match — likely a rounding difference
  if (diff <= effectiveCloseTolerance) {
    // Determine if it's a rounding issue
    const userDecimals = countDecimals(userAnswer);
    const correctDecimals = countDecimals(correctAnswer);
    const isRoundingIssue = userDecimals !== correctDecimals;

    let roundingWarning: string;
    if (isRoundingIssue) {
      roundingWarning = `Your answer (${userAnswer}) is very close to the correct answer (${correctAnswer}). You rounded to ${userDecimals} decimal place${userDecimals !== 1 ? 's' : ''} but the expected precision is ${correctDecimals} decimal place${correctDecimals !== 1 ? 's' : ''}. The difference is ${diff.toFixed(6)}. On the exam, pay attention to how many decimal places are requested.`;
    } else {
      roundingWarning = `Your answer (${userAnswer}) is very close to the correct answer (${correctAnswer}). The difference of ${diff.toFixed(6)} is likely due to intermediate rounding. Try to carry more decimal places through your calculations and only round the final answer.`;
    }

    return {
      is_correct: true, // Count it correct but warn
      is_close: true,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      difference: diff,
      feedback: 'Close enough — counted as correct!',
      rounding_warning: roundingWarning,
    };
  }

  // Check relative error for very large numbers
  if (correctNum !== 0) {
    const relativeError = diff / Math.abs(correctNum);
    if (relativeError < 0.001) { // Within 0.1% relative
      return {
        is_correct: true,
        is_close: true,
        user_answer: userAnswer,
        correct_answer: correctAnswer,
        difference: diff,
        feedback: 'Close enough — counted as correct!',
        rounding_warning: `Your answer (${userAnswer}) differs from the expected answer (${correctAnswer}) by ${(relativeError * 100).toFixed(3)}%. This small difference is likely from rounding. The answer is counted as correct.`,
      };
    }
  }

  // Wrong answer
  return {
    is_correct: false,
    is_close: false,
    user_answer: userAnswer,
    correct_answer: correctAnswer,
    difference: diff,
    feedback: `Incorrect. The correct answer is ${correctAnswer}.`,
  };
}

/**
 * Check a text/string answer (case-insensitive, trimmed)
 */
export function checkTextAnswer(
  userAnswer: string,
  correctAnswer: string,
  partial: boolean = false
): CheckResult {
  const userClean = (userAnswer || '').toLowerCase().trim();
  const correctClean = (correctAnswer || '').toLowerCase().trim();

  if (userClean === correctClean) {
    return {
      is_correct: true,
      is_close: false,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      difference: null,
      feedback: 'Correct!',
    };
  }

  // Check for close text matches (common typos, minor variations)
  if (partial) {
    // If either contains the other
    if (userClean.includes(correctClean) || correctClean.includes(userClean)) {
      return {
        is_correct: true,
        is_close: true,
        user_answer: userAnswer,
        correct_answer: correctAnswer,
        difference: null,
        feedback: 'Correct! (Partial match accepted)',
      };
    }
  }

  return {
    is_correct: false,
    is_close: false,
    user_answer: userAnswer,
    correct_answer: correctAnswer,
    difference: null,
    feedback: `Incorrect. The correct answer is "${correctAnswer}".`,
  };
}

/**
 * Check a multiple choice answer
 */
export function checkMultipleChoice(
  userAnswer: string,
  correctAnswer: string
): CheckResult {
  const match = (userAnswer || '').trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase();
  return {
    is_correct: match,
    is_close: false,
    user_answer: userAnswer,
    correct_answer: correctAnswer,
    difference: null,
    feedback: match ? 'Correct!' : `Incorrect. The correct answer is "${correctAnswer}".`,
  };
}

/**
 * Universal answer checker that picks the right method based on question type
 */
export function checkAnswer(
  userAnswer: string,
  correctAnswer: string,
  questionType: string,
  tolerance: number = 0.01
): CheckResult {
  switch (questionType) {
    case 'numeric_input':
    case 'math_template':
      return checkNumericAnswer(userAnswer, correctAnswer, tolerance);
    case 'multiple_choice':
    case 'true_false':
      return checkMultipleChoice(userAnswer, correctAnswer);
    case 'short_answer':
      return checkTextAnswer(userAnswer, correctAnswer, true);
    case 'fill_blank':
      return checkTextAnswer(userAnswer, correctAnswer, false);
    default:
      return checkTextAnswer(userAnswer, correctAnswer, false);
  }
}

// Helper: count decimal places in a string number
function countDecimals(numStr: string): number {
  const cleaned = (numStr || '').trim();
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx === -1) return 0;
  return cleaned.length - dotIdx - 1;
}
