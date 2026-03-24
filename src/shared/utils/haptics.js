export function haptic(pattern = 'light') {
  if (!navigator.vibrate) return;
  const patterns = { light: 20, medium: 40, success: [20, 30, 20] };
  navigator.vibrate(patterns[pattern] ?? 20);
}
