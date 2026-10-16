import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { StageList } from './StageRail';

/** The stage list behind a button, for screens too narrow for the rail. */
export function StageSheet({ currentTitle }: { currentTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-rule px-4 py-2 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between font-normal">
            <span className="truncate">{currentTitle}</span>
            <span className="text-ink-muted">Stages</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(22rem,90vw)] overflow-y-auto bg-paper p-0">
          <SheetHeader className="px-4 pt-5">
            <SheetTitle>Stages</SheetTitle>
            <SheetDescription>Each stage fixes a problem left by the one before.</SheetDescription>
          </SheetHeader>
          <div className="pb-6">
            <StageList onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
