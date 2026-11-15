import { useMutation, useQuery, useQueryClient, keepPreviousData, queryOptions } from '@tanstack/react-query';
import type {
  AdminCreateInput,
  AdminDto,
  AdminRole,
  AdminStatsDto,
  ConfirmResult,
  QuestionDto,
  QuestionFilters,
  QuestionGroupDto,
  QuestionInput,
  QuestionKind,
  QuestionListItem,
  RoomDetailDto,
  RoomInput,
  RoomListItem,
  RoomResultsDto,
} from '@sq/shared';
import { del, get, patch, post, put } from '@/lib/api';

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

export const qk = {
  questions: ['questions'] as const,
  questionList: (p: QuestionListParams) => ['questions', 'list', p] as const,
  question: (id: number) => ['questions', 'one', id] as const,
  // under 'questions' so every question mutation also refreshes the groups (their counts)
  questionGroups: (f: QuestionFilters) => ['questions', 'groups', f] as const,
  rooms: ['rooms'] as const,
  roomList: ['rooms', 'list'] as const,
  room: (id: number) => ['rooms', 'one', id] as const,
  results: (id: number) => ['rooms', 'results', id] as const,
  admins: ['admins'] as const,
  stats: (days: number) => ['admins', 'stats', days] as const,
  serverInfo: ['server-info'] as const,
};

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

export interface QuestionListParams {
  q?: string;
  kind?: QuestionKind;
  tag?: string;
  scope?: 'all' | 'mine' | 'public';
  /** only this group's questions, in group order */
  groupId?: number;
  /** only questions in no group */
  ungrouped?: boolean;
  page?: number;
  pageSize?: number;
}

export interface QuestionListResponse {
  items: QuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
  tags: string[];
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function questionListQuery(params: QuestionListParams) {
  return queryOptions({
    queryKey: qk.questionList(params),
    queryFn: ({ signal }) =>
      get<QuestionListResponse>(
        `/api/admin/questions${qs({
          q: params.q,
          kind: params.kind,
          tag: params.tag,
          scope: params.scope,
          groupId: params.groupId,
          ungrouped: params.ungrouped ? 1 : undefined,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
        signal,
      ),
  });
}

export function useQuestionList(params: QuestionListParams) {
  return useQuery({ ...questionListQuery(params), placeholderData: keepPreviousData });
}

export function useQuestion(id: number | null) {
  return useQuery({
    queryKey: qk.question(id ?? 0),
    queryFn: ({ signal }) => get<QuestionDto>(`/api/admin/questions/${id}`, signal),
    enabled: id !== null,
  });
}

export function useSaveQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: QuestionInput }) =>
      id === null ? post<QuestionDto>('/api/admin/questions', input) : put<QuestionDto>(`/api/admin/questions/${id}`, input),
    onSuccess: (q) => {
      qc.setQueryData(qk.question(q.id), q);
      void qc.invalidateQueries({ queryKey: qk.questions });
      void qc.invalidateQueries({ queryKey: qk.rooms });
    },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => del<{ ok: true }>(`/api/admin/questions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.questions });
      void qc.invalidateQueries({ queryKey: qk.rooms });
    },
  });
}

export function useDuplicateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => post<QuestionDto>(`/api/admin/questions/${id}/duplicate`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.questions }),
  });
}

/* ------------------------------------------------------------------ */
/* Question groups                                                     */
/* ------------------------------------------------------------------ */

export function useQuestionGroups(filters: QuestionFilters = {}) {
  return useQuery({
    queryKey: qk.questionGroups(filters),
    queryFn: async ({ signal }): Promise<QuestionGroupDto[]> =>
      (
        await get<{ items: QuestionGroupDto[] }>(
          `/api/admin/question-groups${qs({ q: filters.q, kind: filters.kind, tag: filters.tag, scope: filters.scope })}`,
          signal,
        )
      ).items,
    placeholderData: keepPreviousData,
  });
}

function useQuestionMutation<V, R>(fn: (v: V) => Promise<R>, opts: { rooms?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.questions });
      if (opts.rooms) void qc.invalidateQueries({ queryKey: qk.rooms });
    },
  });
}

export const useSaveGroup = () =>
  useQuestionMutation(({ id, name }: { id: number | null; name: string }) =>
    id === null ? post<QuestionGroupDto>('/api/admin/question-groups', { name }) : patch<QuestionGroupDto>(`/api/admin/question-groups/${id}`, { name }),
  );

export const useDeleteGroup = () =>
  useQuestionMutation(
    ({ id, withQuestions }: { id: number; withQuestions: boolean }) =>
      del<{ ok: true; deletedQuestions: number }>(`/api/admin/question-groups/${id}${withQuestions ? '?withQuestions=1' : ''}`),
    { rooms: true },
  );

export const useMoveQuestions = () =>
  useQuestionMutation((body: { questionIds: number[]; groupId: number | null }) => post<{ moved: number }>('/api/admin/questions/move', body));

export const useReorderGroup = () =>
  useQuestionMutation(({ id, questionIds }: { id: number; questionIds: number[] }) =>
    put<{ ok: true }>(`/api/admin/question-groups/${id}/order`, { questionIds }),
  );

export const useGroupVisibility = () =>
  useQuestionMutation(
    ({ id, isPublic }: { id: number; isPublic: boolean }) => post<{ changed: number }>(`/api/admin/question-groups/${id}/visibility`, { isPublic }),
    { rooms: true },
  );

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

export function useRoomList() {
  return useQuery({
    queryKey: qk.roomList,
    queryFn: ({ signal }) => get<RoomListItem[]>('/api/admin/rooms', signal),
    refetchInterval: 10_000,
  });
}

export function useRoom(id: number | null, opts: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: qk.room(id ?? 0),
    queryFn: ({ signal }) => get<RoomDetailDto>(`/api/admin/rooms/${id}`, signal),
    enabled: id !== null,
    refetchInterval: opts.refetchInterval,
  });
}

export function useRoomResults(id: number | null, opts: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: qk.results(id ?? 0),
    queryFn: ({ signal }) => get<RoomResultsDto>(`/api/admin/rooms/${id}/results`, signal),
    enabled: id !== null && opts.enabled !== false,
    refetchInterval: opts.refetchInterval,
  });
}

function useRoomMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rooms }),
  });
}

export const useSaveRoom = () =>
  useRoomMutation(({ id, input }: { id: number | null; input: RoomInput }) =>
    id === null ? post<RoomDetailDto>('/api/admin/rooms', input) : put<RoomDetailDto>(`/api/admin/rooms/${id}`, input),
  );
export const useDeleteRoom = () => useRoomMutation((id: number) => del<{ ok: true }>(`/api/admin/rooms/${id}`));
export const useConfirmRoom = () => useRoomMutation((id: number) => post<ConfirmResult>(`/api/admin/rooms/${id}/confirm`));
export const useUnconfirmRoom = () => useRoomMutation((id: number) => post<RoomDetailDto>(`/api/admin/rooms/${id}/unconfirm`));
export const useCloneRoom = () => useRoomMutation((id: number) => post<RoomDetailDto>(`/api/admin/rooms/${id}/clone`));
export const useResetRoom = () => useRoomMutation((id: number) => post<RoomDetailDto>(`/api/admin/rooms/${id}/reset`));
export const useRotatePresenterKey = () =>
  useRoomMutation((id: number) => post<{ presenterUrl: string }>(`/api/admin/rooms/${id}/presenter-key/rotate`));

export interface ServerInfo {
  lanAddresses: string[];
  port: number;
  publicBaseUrl: string | null;
  suggestedBaseUrl: string;
}

export function useServerInfo() {
  return useQuery({ queryKey: qk.serverInfo, queryFn: () => get<ServerInfo>('/api/admin/server-info'), staleTime: 300_000 });
}

/* ------------------------------------------------------------------ */
/* Admin accounts                                                      */
/* ------------------------------------------------------------------ */

export function useAdmins() {
  return useQuery({ queryKey: qk.admins, queryFn: ({ signal }) => get<AdminDto[]>('/api/admin/admins', signal) });
}

export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminCreateInput) => post<AdminDto>('/api/admin/admins', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.admins }),
  });
}

export function usePatchAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; displayName?: string; disabled?: boolean; password?: string; role?: AdminRole }) =>
      patch<AdminDto>(`/api/admin/admins/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.admins }),
  });
}

/** Usage overview for the main admin (counts only). Days bucket in the viewer's local time. */
export function useAdminStats(days: number) {
  return useQuery({
    queryKey: qk.stats(days),
    queryFn: ({ signal }) => get<AdminStatsDto>(`/api/admin/stats?days=${days}&tz=${-new Date().getTimezoneOffset()}`, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => put<{ ok: true }>('/api/auth/password', body),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName: string }) => patch<AdminDto>('/api/auth/me', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      void qc.invalidateQueries({ queryKey: qk.admins });
    },
  });
}
