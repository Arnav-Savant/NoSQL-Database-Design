import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from './router';
import { ThemeProvider } from './ThemeProvider';

export function App() {
  return (
    <ThemeProvider>
      {/* Motion follows the visitor's reduced-motion setting everywhere. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={150}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
