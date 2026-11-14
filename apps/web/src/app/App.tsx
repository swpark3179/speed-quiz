import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { usePrefs } from '@/stores/prefs';
import { ApiError } from '@/lib/api';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

const loadMotionFeatures = () => import('./motion-features').then((m) => m.default);

export function App() {
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduce-motion', reduceMotion);
  }, [reduceMotion]);
  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={loadMotionFeatures} strict>
        <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
          <RouterProvider router={router} />
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ style: { fontFamily: 'var(--font-sans)', fontWeight: 600 } }}
          />
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
