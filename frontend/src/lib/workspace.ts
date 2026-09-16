import type { ProjectAction, Production } from './types';
export type WorkspaceAction = ProjectAction & { production?: Pick<Production, 'id' | 'title' | 'jobCode' | 'clientName'> | null };
export const actionStatuses = { TODO: 'To do', IN_PROGRESS: 'In progress', WAITING: 'Waiting', BLOCKED: 'Blocked', DONE: 'Done', CANCELLED: 'Cancelled' } as const;
export const isOpenAction = (action: WorkspaceAction) => !['DONE', 'CANCELLED'].includes(action.status);
export const projectLink = (id: string, tab = 'Overview') => `/productions?production=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}`;
export const shortDate = (date?: string | null) => date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

export type ProjectSummary = Pick<Production, 'id' | 'title' | 'jobCode' | 'clientName' | 'brand' | 'status'> & {
  quotedValue: number; actualSpend: number; variance: number; overBudget: boolean; crewCount: number;
  driveFolderId: string | null; driveFolderName: string | null;
  nextDate: { id: string; date: string; dateType: import('./types').ProductionDateType } | null;
  budget: { id: string; currencyBase: string; status: string; currentRevision: { status: string; revisionNumber: number } | null } | null;
};
