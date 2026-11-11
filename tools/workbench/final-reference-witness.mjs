import {isDeepStrictEqual as equal} from 'node:util';
import {visibilityPointer} from './content-visibility.mjs';
import {sketchHash} from './sketch-authority.mjs';
export function closesReferenceBoundaryWitness({planning,witness,trusted,catalog}){
 if(witness.kind!=='reference_boundaries'||witness.requires!=='resolveContentSourceLocation'||witness.sourceJobId!==trusted?.contract.rootJobId)return false;
 const jobIndex=planning.jobs.findIndex(j=>j.id===witness.sourceJobId),prefix=`/jobs/${jobIndex}/task/source/visibility/occurrences/`;
 if(!witness.originalPointer.startsWith(prefix)||!/^\d+$/.test(witness.originalPointer.slice(prefix.length)))return false;
 const occurrence=visibilityPointer(planning,witness.originalPointer),source=planning.jobs[jobIndex]?.task.source;
 if(!occurrence||!equal(source,trusted.source)||occurrence.originalContainerId!==witness.containerId||occurrence.originalContainerHash!==witness.containerHash||witness.containerId!==`${source.visual.artifactId}/referenceBoundaries`)return false;
 const rows=catalog?.rows.filter(row=>row.originId===occurrence.clauseId)??[];
 if(rows.length!==1)return false;
 const location=rows[0].originals.find(location=>location.occurrenceId===occurrence.occurrenceId);
 if(!location||location.kind!=='original_occurrence'||location.rootJobId!==witness.sourceJobId||location.sourceHash!==source.sourceHash||location.projectionHash!==source.visibility.projectionHash||location.containerId!==witness.containerId||location.containerHash!==witness.containerHash||location.pointer!==occurrence.originalPointer||location.valueHash!==occurrence.valueHash||location.owner!==occurrence.sourceOwner)return false;
 const matches=catalog.entries.filter(e=>equal(e.location,location));
 return matches.length===1&&equal(matches[0].ancestryAnchor,rows[0].ancestryAnchor)&&equal(rows[0].ancestryAnchor,{artifactId:source.visual.artifactId,contentHash:source.visual.contentHash,role:'ancestry_anchor'})&&sketchHash(matches[0].value)===location.valueHash;
}
