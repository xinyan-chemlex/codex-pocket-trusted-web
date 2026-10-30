const timestamp=value=>{if(value==null||value==='')return 0;const number=Number(value);if(Number.isFinite(number))return number>0&&number<100000000000?number*1000:number;const date=Date.parse(value);return Number.isFinite(date)?date:0;};
export const activityTime=item=>Math.max(0,...['lastActivityAt','recencyAt','updatedAt','createdAt'].map(key=>timestamp(item?.[key])));
export function chronologicalWorkspace(projects,threads){
  const orderedThreads=[...threads].sort((a,b)=>activityTime(b)-activityTime(a)),latest=new Map();
  for(const thread of orderedThreads)latest.set(thread.projectId,Math.max(latest.get(thread.projectId)||0,activityTime(thread)));
  return{threads:orderedThreads,projects:projects.map(project=>({...project,lastActivityAt:Math.max(activityTime(project),latest.get(project.id)||0)})).sort((a,b)=>b.lastActivityAt-a.lastActivityAt)};
}
export const workspaceOrder=workspace=>JSON.stringify(workspace.projects.map(project=>[project.id,workspace.threads.filter(thread=>thread.projectId===project.id).map(thread=>thread.id)]));
