import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile,FileBlob} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/marc/.codex/plugins/cache/openai-primary-runtime/presentations/26.1020.11618/skills/presentations/container_tools/artifact_tool_utils.mjs';
import {engineeringFixture} from './chart-fixture.mjs';
import {parseChartEvidence} from './chart-data.mjs';
import {addNativeChart,chartPackageManifest,requiredNativeChartOwnerSlides} from './native-chart-writer.mjs';
import {verifyNativeChartPackage,python} from './chart-package-client.mjs';
const skill='/Users/marc/.codex/plugins/cache/openai-primary-runtime/presentations/26.1020.11618/skills/presentations';
export async function exportEngineeringFixture(root) {
  // Exclusive creation prevents accidental overwrite of any prior fixture output.
  await fs.mkdir(root);await fs.mkdir(path.join(root,'build'));await fs.mkdir(path.join(root,'delivery'));
  const {raw,sources}=engineeringFixture();const validated=parseChartEvidence(raw,sources);
  await fs.writeFile(path.join(root,'source.json'),JSON.stringify(raw,null,2));await fs.writeFile(path.join(root,'original-sources.json'),JSON.stringify(sources,null,2));
  const p=Presentation.create({slideSize:{width:1280,height:720}});const occurrences=[];
  for(const [index,c] of validated.charts.entries()) {
    const slide=p.slides.add();slide.background.fill='#FFFFFF';
    occurrences.push(addNativeChart(slide,validated,c.chartId,{slideNumber:index+1,name:`chart-${c.chartId}`,left:80,top:50,width:1120,height:600},{fontFamily:'Arial',titleSize:24,axisSize:18,legendSize:18,labelSize:16}));
    slide.speakerNotes.text=`SYNTHETIC ENGINEERING FIXTURE ONLY. ${c.period}. ${c.population}. ${c.limitations.join(' ')} Original source ${sources[0].sourceId} ${sources[0].sha256}. No customer evidence. This fixture verifies native charts without a product layout approval.`;
  }
  const manifest=chartPackageManifest(validated,occurrences);await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
  const draft=path.join(root,'build','draft.pptx');await(await PresentationFile.exportPptx(p)).save(draft);
  const final=path.join(root,'delivery','synthetic-native-charts.pptx');
  await finalizePresentation({workspaceDir:root,candidatePath:draft,finalPath:final,pythonExecutable:python,integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000'],explicitTotalSlideCount:3,requiredNativeChartOwnerSlides:requiredNativeChartOwnerSlides(occurrences),materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,receiptPath:path.join(root,'build','finalization.json')});
  const proof=verifyNativeChartPackage(final,raw,sources,manifest);await fs.writeFile(path.join(root,'build','package-proof.json'),JSON.stringify(proof,null,2));
  const imported=await PresentationFile.importPptx(await FileBlob.load(final));
  for(let i=0;i<3;i++){const slide=imported.slides.items[i];const png=await imported.export({slide,format:'png',scale:1});await fs.writeFile(path.join(root,'build',`final-slide-${i+1}.png`),new Uint8Array(await png.arrayBuffer()));}
  return {root,final,proof:path.join(root,'build','package-proof.json'),nativeApplicationEditVerified:false};
}
