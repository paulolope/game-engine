export function brushFalloff(distance, radius, falloff = 0.5) {
  if (radius <= 0) return 0;
  if (distance > radius) return 0;
  const t = 1 - distance / radius;
  const power = 1 + Math.max(0, Math.min(1, falloff)) * 3;
  return Math.pow(t, power);
}
