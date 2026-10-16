import { createBrowserRouter } from 'react-router';
import { JourneyLayout } from '@/layouts/JourneyLayout';
import { SiteLayout } from '@/layouts/SiteLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { StagePage } from '@/pages/StagePage';
import { WholeDatabasePage } from '@/pages/WholeDatabasePage';

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'database', element: <WholeDatabasePage /> },
      {
        path: 'stages',
        element: <JourneyLayout />,
        children: [{ path: ':slug', element: <StagePage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
