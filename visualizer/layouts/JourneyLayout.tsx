import { Outlet, useParams } from 'react-router';
import { stageBySlug } from '@/content/registry';
import { StageRail } from './StageRail';
import { StageSheet } from './StageSheet';

export function JourneyLayout() {
  const { slug } = useParams();
  const stage = stageBySlug(slug);
  return (
    <div className="mx-auto grid w-full max-w-[1600px] flex-1 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <StageRail />
      <div className="min-w-0">
        <StageSheet currentTitle={stage ? `${stage.meta.number}. ${stage.meta.title}` : 'Stages'} />
        <Outlet />
      </div>
    </div>
  );
}
