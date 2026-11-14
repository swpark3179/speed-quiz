import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { Spinner } from '@/ui/display';
import { RequireAdmin, RequireMainAdmin } from '@/features/admin/RequireAdmin';
import { NotFoundPage, RouteError } from './RouteError';

function page(load: () => Promise<{ default: ComponentType }>): ReactNode {
  const C = lazy(load);
  return (
    <Suspense fallback={<FullSpinner />}>
      <C />
    </Suspense>
  );
}

export function FullSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-n-400">
      <Spinner className="size-8" />
    </div>
  );
}

const devRoutes = import.meta.env.DEV
  ? [{ path: '/dev/gallery', element: page(() => import('@/features/dev/GalleryPage')) }]
  : [];

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    element: <Outlet />,
    children: [
      { path: '/', element: <Navigate to="/join" replace /> },
      { path: '/join', element: page(() => import('@/features/join/JoinPage')) },
      { path: '/join/:code', element: page(() => import('@/features/join/JoinPage')) },
      { path: '/play/:code', element: page(() => import('@/features/play/PlayPage')) },
      { path: '/screen/:roomId', element: page(() => import('@/features/screen/ScreenPage')) },
      { path: '/admin/login', element: page(() => import('@/features/admin/auth/LoginPage')) },
      {
        path: '/admin/rooms/:id/live',
        element: <RequireAdmin>{page(() => import('@/features/admin/live/LivePage'))}</RequireAdmin>,
      },
      {
        path: '/admin',
        element: <RequireAdmin>{page(() => import('@/features/admin/layout/AdminLayout'))}</RequireAdmin>,
        children: [
          { index: true, element: <Navigate to="/admin/rooms" replace /> },
          { path: 'questions', element: page(() => import('@/features/admin/questions/QuestionListPage')) },
          { path: 'questions/new', element: page(() => import('@/features/admin/questions/QuestionEditPage')) },
          { path: 'questions/:id', element: page(() => import('@/features/admin/questions/QuestionEditPage')) },
          { path: 'rooms', element: page(() => import('@/features/admin/rooms/RoomListPage')) },
          { path: 'rooms/new', element: page(() => import('@/features/admin/rooms/RoomWizardPage')) },
          { path: 'rooms/:id/edit', element: page(() => import('@/features/admin/rooms/RoomWizardPage')) },
          { path: 'rooms/:id', element: page(() => import('@/features/admin/rooms/RoomDetailPage')) },
          { path: 'me', element: page(() => import('@/features/admin/accounts/MyAccountPage')) },
          {
            path: 'accounts',
            element: <RequireMainAdmin>{page(() => import('@/features/admin/accounts/AccountsPage'))}</RequireMainAdmin>,
          },
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
