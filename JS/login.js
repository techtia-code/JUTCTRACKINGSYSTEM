export const ADMIN_USERNAME = 'JUTCAdmin2026';
export const ADMIN_EMAIL = 'jutcadmin2026@example.invalid';

export function loginEmail(entered) {
  const value = entered.trim();
  return value.toLowerCase() === ADMIN_USERNAME.toLowerCase() ? ADMIN_EMAIL : value;
}
