import {FREE_PLAN_STATEMENT,FREE_PLAN_SAFETY} from '@/lib/free-plan.mjs';
export default function FreePlanNotice(){return <aside data-testid="free-plan-terms" className="my-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600"><p>{FREE_PLAN_STATEMENT}</p><p className="mt-1 text-[10.5px] text-neutral-500">{FREE_PLAN_SAFETY}</p></aside>}
