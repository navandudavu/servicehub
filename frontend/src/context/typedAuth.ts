import { useAuth as useAuthUntyped } from './AuthContext';

/** Typed view of the existing (plain JS) auth context, for the .tsx files. */
export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'technician';
}

export function useCurrentUser(): CurrentUser | null {
  return (useAuthUntyped() as unknown as { user: CurrentUser | null }).user;
}
