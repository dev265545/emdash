import type { ReactNode } from 'react';
import React from 'react';

interface RepoGroupViewWrapperProps {
  children: ReactNode;
  repoGroupId: string;
}

export function RepoGroupViewWrapper({ children }: RepoGroupViewWrapperProps) {
  return <>{children}</>;
}
