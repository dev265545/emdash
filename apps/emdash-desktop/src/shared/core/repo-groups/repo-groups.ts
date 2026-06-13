export type RepoGroup = {
  id: string;
  name: string;
  memberProjectIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateRepoGroupParams = {
  id?: string;
  name: string;
  projectIds: string[];
};

export type UpdateRepoGroupParams = {
  name?: string;
  projectIds?: string[];
};

export type RepoGroupError =
  | { type: 'not-found' }
  | { type: 'name-taken'; name: string }
  | { type: 'min-members'; required: number }
  | { type: 'error'; message: string };
