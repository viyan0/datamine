import type { SharedProfile } from './enrollment-types';
const key = 'datamine-demo-profile';
export function readDemoProfile(): SharedProfile | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeDemoProfile(profile: SharedProfile) {
  sessionStorage.setItem(key, JSON.stringify(profile));
}
export const sampleProfiles: SharedProfile[] = [
  {
    id: 'demo-profile-1',
    phone: '+000 000 201',
    name: 'Sara Ahmed',
    language: 'en',
    destination: 'Home office furniture',
    interests: ['furniture', 'delivery'],
    status: 'active',
    consentAt: '2026-10-08T08:00:00Z',
    updatedAt: '2026-10-08T08:00:00Z',
  },
  {
    id: 'demo-profile-2',
    phone: '+000 000 202',
    name: 'Omar Ali',
    language: 'ar',
    destination: '',
    interests: ['booking'],
    status: 'optedOut',
    consentAt: '2026-10-07T08:00:00Z',
    updatedAt: '2026-10-08T07:00:00Z',
  },
];
