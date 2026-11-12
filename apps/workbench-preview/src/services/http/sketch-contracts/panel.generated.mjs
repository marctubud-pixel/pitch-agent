export const INDEPENDENT_VISUAL_ROLES=['visual','brand','user','communication'];
export function independentVisualPanel(cohortId=null,qualitative=false) {
 const make=(phase,role,dependencies=[])=>({key:`${cohortId===null?'':`${cohortId}:`}${phase}:${role}`,...(cohortId===null?{}:{cohortId}),phase,role,dependencies,...(cohortId===null?{}:{qualitative})});
 const first=['score','blind'].flatMap(phase=>INDEPENDENT_VISUAL_ROLES.map(role=>make(phase,role)));
 const challenges=INDEPENDENT_VISUAL_ROLES.map(role=>make('challenge',role,[make('score',role).key,make('blind',role).key]));
 return [...first,...challenges,make('director','director',[...first,...challenges].map(n=>n.key))];
}
