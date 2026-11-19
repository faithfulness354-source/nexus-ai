/**
 * Pure multi-signal underage gate (no I/O).
 * Flat chest / short stature / petite alone must never force a flag.
 */

export type MaturityLabel = 'adult' | 'ambiguous' | 'childlike';

/**
 * Enforce the multi-signal rule in code so a model cannot flag solely on
 * flat chest / short stature / petite by inventing a single childlike axis.
 */
export function applyMultiSignalUnderageRule(raw: {
  isUnderageOrChildlike?: boolean;
  facialMaturity: MaturityLabel;
  bodyMaturity: MaturityLabel;
  overallPresentation: MaturityLabel;
  reasons?: string[];
}): { isUnderageOrChildlike: boolean; underageSignalCount: number; reasons: string[] } {
  const axes = [raw.facialMaturity, raw.bodyMaturity, raw.overallPresentation];
  const underageSignalCount = axes.filter((a) => a === 'childlike').length;
  const adultFaceAndOverall =
    raw.facialMaturity === 'adult' && raw.overallPresentation === 'adult';

  // Hard veto: adult face + adult overall presentation cannot be underage
  // regardless of bust size, height, or slim/petite build.
  if (adultFaceAndOverall) {
    return {
      isUnderageOrChildlike: false,
      underageSignalCount,
      reasons: raw.reasons?.length
        ? raw.reasons
        : ['Adult facial presentation and overall depiction; single build traits ignored.'],
    };
  }

  // Require convergence: at least two childlike axes.
  const isUnderageOrChildlike = underageSignalCount >= 2;
  return {
    isUnderageOrChildlike,
    underageSignalCount,
    reasons: isUnderageOrChildlike
      ? (raw.reasons?.length
        ? raw.reasons
        : [`Multiple childlike cues converged (${underageSignalCount}/3 axes).`])
      : (raw.reasons || []),
  };
}
