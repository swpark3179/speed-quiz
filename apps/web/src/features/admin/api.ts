import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  AdminCreateInput,
  AdminDto,
  ConfirmResult,
  QuestionDto,
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
  rooms: ['rooms'] as const,
  roomList: ['rooms', 'list'] as const,
  room: (id: number) => ['rooms', 'one', id] as const,
  results: (id: number) => ['rooms', 'results', id] as const,
  admins: ['admins'] as const,
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

export function useQuestionList(params: QuestionListParams) {
  return useQuery({
    queryKey: qk.questionList(params),
    queryFn: ({ signal }) =>
      get<QuestionListResponse>(
        `/api/admin/questions${qs({ q: params.q, kind: params.kind, tag: params.tag, scope: params.scope, page: params.page, pageSize: params.pageSize })}`,
        signal,
      ),
    placeholderData: keepPreviousData,
  });
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
    mutationFn: ({ id, ...body }: { id: number; displayName?: string; disabled?: boolean; password?: string }) =>
      patch<AdminDto>(`/api/admin/admins/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.admins }),
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
