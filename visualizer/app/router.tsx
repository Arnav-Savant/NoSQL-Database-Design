import { createBrowserRouter, Navigate } from 'react-router';
import { SiteLayout } from '@/layouts/SiteLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';

// Everything past the overview loads on demand, so the first page doesn't pay for every stage.
export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'database', lazy: async () => ({ Component: (await import('@/pages/WholeDatabasePage')).WholeDatabasePage }) },
      { path: 'codebase', element: <Navigate to="/codebase/javascript/README.md" replace /> },
      { path: 'codebase/:language/*', lazy: async () => ({ Component: (await import('@/pages/CodebasePage')).CodebasePage }) },
      {
        path: 'stages',
        lazy: async () => ({ Component: (await import('@/layouts/JourneyLayout')).JourneyLayout }),
        children: [{ path: ':slug', lazy: async () => ({ Component: (await import('@/pages/StagePage')).StagePage }) }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
