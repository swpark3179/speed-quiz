import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDto } from '@sq/shared';
import { get, post } from '@/lib/api';

export const meKey = ['auth', 'me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => get<AdminDto>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    try {
      await post('/api/auth/logout');
    } finally {
      qc.clear();
      window.location.assign('/admin/login');
    }
  };
}
