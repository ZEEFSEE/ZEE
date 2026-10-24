/**
 * Offline-only reference model for the Nebula Breathing Hub visual pulse.
 *
 * This is a deterministic simulation helper, not a sensor integration or
 * production control law. It must not be connected to world navigation.
 *
 * Proposed mapping:
 *   normalizedDeviation = (breathsPerMinute - baseline) / baseline
 *   targetModulation = clamp(feedbackGain * normalizedDeviation, -limit, +limit)
 *   smoothedModulation = previous + smoothingCoefficient *
 *                        (targetModulation - previous)
 *
 * Returned modulation is a fraction of baseline pulse amplitude.
 */
export function simulateBreathPulse({
  breathsPerMinute,
  previousModulation = 0,
  baselineBreathsPerMinute = 8,
  feedbackGain = 0.15,
  pulseAmplitudeClampPercent = 10,
  smoothingCoefficient = 0.20,
}) {
  const values = [
    breathsPerMinute,
    previousModulation,
    baselineBreathsPerMinute,
    feedbackGain,
    pulseAmplitudeClampPercent,
    smoothingCoefficient,
  ];
  if (!values.every(Number.isFinite)) {
    throw new TypeError("All simulation inputs must be finite numbers.");
  }
  if (breathsPerMinute < 0 || baselineBreathsPerMinute <= 0) {
    throw new RangeError("Breath rate must be non-negative and baseline must be positive.");
  }
  if (feedbackGain < 0 || pulseAmplitudeClampPercent < 0) {
    throw new RangeError("Feedback gain and amplitude clamp must be non-negative.");
  }
  if (smoothingCoefficient < 0 || smoothingCoefficient > 1) {
    throw new RangeError("Smoothing coefficient must be between 0 and 1.");
  }

  const clamp = pulseAmplitudeClampPercent / 100;
  const normalizedDeviation =
    (breathsPerMinute - baselineBreathsPerMinute) / baselineBreathsPerMinute;
  const targetModulation = Math.max(
    -clamp,
    Math.min(clamp, feedbackGain * normalizedDeviation),
  );
  const modulation =
    previousModulation + smoothingCoefficient * (targetModulation - previousModulation);

  return {
    normalizedDeviation,
    targetModulation,
    modulation,
    pulseAmplitudeScale: 1 + modulation,
    simulationOnly: true,
  };
}
