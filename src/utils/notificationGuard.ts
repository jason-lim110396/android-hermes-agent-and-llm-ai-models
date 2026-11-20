// Notification guard helper for mobile.
export function hasNotifications(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window;
}
