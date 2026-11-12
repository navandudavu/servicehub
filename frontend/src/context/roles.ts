/** Admin-level powers: admins and managers (Menadzer). */
export const isAdminLevel = (role?: string | null): boolean => role === 'admin' || role === 'manager';

/** Team management (the Tim tab: accounts, roles, passwords): admins only. */
export const isOwner = (role?: string | null): boolean => role === 'admin';
