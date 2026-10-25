import React from 'react';

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  authenticatedAt: number;
}

export function getStoredAuthUser(): AuthUser | null {
  return null;
}

export function logoutUser(): void {
  // Sem login necessário
}

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export default AuthGate;
