// Client-only age verification state, kept in sessionStorage for the current browser session.
const KEY = 'age_verified';

export type AgeVerified = true | false | null;

export function getAgeVerified(): AgeVerified {
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function setAgeVerified(value: boolean): void {
  try {
    window.sessionStorage.setItem(KEY, String(value));
  } catch (err) {
    console.error('Could not store age verification:', err);
  }
}

/** Whole years between the date of birth and today; null when the date is invalid or in the future. */
export function ageFromDob(year: number, month: number, day: number, today = new Date()): number | null {
  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return null;
  if (dob > today) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day);
  if (beforeBirthday) age--;
  return age;
}
