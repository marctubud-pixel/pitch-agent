import {coveragePolicy,jsonWireSize} from './native-coverage-policy.mjs';
import {encodeNativeManifest} from './native-manifest.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {bindNativeCharts,verifyNativeObjectCoverage} from './native-charts/chart-export-binding.mjs';
import {GlobalFonts} from '@napi-rs/canvas';
import {Presentation, PresentationFile} from '@oai/artifact-tool';

const skillDir = process.env.PRESENTATIONS_SKILL_DIR || '/Users/marc/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const pythonExecutable = process.env.RUNTIME_PYTHON || '/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const imageTypes = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml'};

function position(element) {
  return {left: element.x, top: element.y, width: element.w, height: element.h};
}

export async function writeImage(slide, element, input, name) {
  const asset = input.assets[element.assetId];
  if (!asset?.file) throw new Error(`Unknown image asset ${element.assetId}`);
  const bytes = await fs.readFile(asset.file);
  if (asset.sha256 !== undefined && createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Image bytes changed ${element.assetId}`);
  if (asset.byteLength !== undefined && bytes.length !== asset.byteLength) throw new Error(`Image length changed ${element.assetId}`);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const gif = ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const svg = path.extname(asset.file).toLowerCase() === '.svg' || asset.mediaType === 'image/svg+xml';
  const contentType = png ? imageTypes['.png'] : jpeg ? imageTypes['.jpg'] : gif ? imageTypes['.gif'] : webp ? imageTypes['.webp'] : svg ? imageTypes['.svg'] : null;
  if (!contentType) throw new Error(`Unsupported image format ${asset.file}`);
  if (asset.mediaType !== undefined && asset.mediaType !== contentType) throw new Error(`Image media type changed ${element.assetId}`);
  const image = slide.images.add({
    blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    contentType,
    alt: element.alt || `${element.assetId} ${asset.role || ''}`.trim(),
    fit: element.fit || 'contain',
    position: position(element),
  });
  image.name = name;
}

const writers = {
  text(slide, element, input, name, context) {
    const shape = slide.shapes.add({geometry: 'textbox', name, position: position(element), fill: 'none', line: {fill: 'none', width: 0}});
    const value=context.native ? context.native.textFor(element, context.slideNumber, name) : element.text;
    shape.text = context.native?.textPolicy==='chart-metadata-lf-v2' && element.lineSpacing!==undefined
      ? value.split(/\r\n|\r|\n/u).map(line=>({runs:[line],paragraphStyle:{lineSpacingPercent:Math.round(element.lineSpacing*100000)}}))
      : value;
    shape.text.style = {
      typeface: input.brand.font.family,
      fontSize: element.size,
      color: element.color,
      bold: Boolean(element.bold),
      alignment: element.align || 'left',
      verticalAlignment: 'top',
      insets: 0,
      wrap: 'none',
      autoFit: 'none',
      ...(element.lineSpacing === undefined ? {} : {lineSpacing: element.lineSpacing}),
    };
  },
  image: writeImage,
  chart(slide,element,input,name,context){context.native.write(slide,element,context.slideNumber,name);},
  ellipse(slide, element, input, name) {
    slide.shapes.add({geometry: 'ellipse', name, position: position(element), fill: element.fill || 'none', line: {fill: element.color, width: element.width}});
  },
  line(slide, element, input, name) {
    slide.shapes.add({geometry: 'line', name, position: position(element), fill: 'none', line: {fill: element.color, width: element.width}});
  },
};

async function refuseExisting(file) {
  try {
    await fs.access(file);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Refusing to overwrite completed output ${file}; choose a new output directory`);
}

export async function exportDeck(input, plan, output) {
  const numeric=input.semantic?.manuscriptVersion==='complete-manuscript-v3'||plan?.slides?.some(s=>s.elements.some(e=>e.type==='chart'));
  return renderDeck(input,plan,output,numeric?bindNativeCharts(input,plan):null);
}

async function renderDeck(input,plan,output,native) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('output must be a directory path');
  if (!plan?.slides?.length) throw new Error('Cannot export an empty slide plan');
  const workspaceDir = path.resolve(output);
  const buildDir = path.join(workspaceDir, 'build');
  const deckPath = path.join(workspaceDir, 'delivery', 'deck.pptx');
  const draftPath = path.join(buildDir, 'draft.pptx');
  const renderDir = path.join(workspaceDir, 'renders');
  const manifestPath = path.join(workspaceDir, 'layout-manifest.json');
  const validationPath = path.join(buildDir, 'validation.json');
  await refuseExisting(deckPath);
  await fs.mkdir(buildDir, {recursive: true});
  const lockPath = path.join(buildDir, '.export.lock');
  const lock = await fs.open(lockPath, 'wx').catch(error => {
    if (error.code === 'EEXIST') throw new Error(`Export already active or interrupted in ${workspaceDir}; inspect ${lockPath} before retrying`);
    throw error;
  });
  try {
    await refuseExisting(deckPath);
    for (const entry of input.brand.font.files) {
      const file = typeof entry === 'string' ? entry : entry.path || entry.file;
      if (!GlobalFonts.registerFromPath(file)) throw new Error(`Cannot register brand font ${file}`);
    }
    const presentation = Presentation.create({slideSize: {width: plan.width, height: plan.height}});
    for (const [pageIndex,page] of plan.slides.entries()) {
      const slide = presentation.slides.add();
      slide.background.fill = page.background;
      for (const [index, element] of page.elements.entries()) {
        const writer = writers[element.type];
        if (!writer) throw new Error(`Unsupported element type ${element.type} on ${page.id}`);
        await writer(slide, element, input, element.id || `${page.id}-${element.type}-${index + 1}`,{native,slideNumber:pageIndex+1});
      }
      slide.speakerNotes.text = Array.isArray(page.notes) ? page.notes.join('\n\n') : page.notes || '';
    }
    await fs.mkdir(renderDir, {recursive: true});
    await fs.mkdir(path.dirname(deckPath), {recursive: true});
    const renderPaths = [];
    for (const [index, slide] of presentation.slides.items.entries()) {
      const renderPath = path.join(renderDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
      const png = await presentation.export({slide, format: 'png', scale: 1});
      await fs.writeFile(renderPath, new Uint8Array(await png.arrayBuffer()));
      renderPaths.push(renderPath);
    }
    await (await PresentationFile.exportPptx(presentation)).save(draftPath);
    await fs.writeFile(manifestPath, encodeNativeManifest({schemaVersion: 2, ...plan, semanticContent:input.semantic, fontInspection:input.fontInspection??null, imageResources:Object.fromEntries(Object.entries(input.assets).map(([id,a])=>[id,{sha256:a.sha256,byteLength:a.byteLength,width:a.width,height:a.height,file:a.file,role:a.role,...(a.application?{application:a.application}:{}),...(a.role==='mockup'?{purpose:a.purpose,aperture:a.aperture}:{})}])), inputHashes: input.hashes, fontFamily: input.brand.font.family, renderPaths}));
    const {finalizePresentation} = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
    await finalizePresentation({
      workspaceDir,
      candidatePath: draftPath,
      finalPath: deckPath,
      pythonExecutable,
      integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
      layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
      layoutArgs: ['--expected-slide-size-emu', `${Math.round(plan.width * 9525)},${Math.round(plan.height * 9525)}`, '--validate-bullet-geometry', '--validate-heading-fit'],
      explicitTotalSlideCount: plan.slides.length,
      requiredNativeTableOwnerSlides: [],
      requiredNativeChartOwnerSlides: native ? native.requiredOwnerSlides() : [],
      ...(native ? {materializeLiteralChartWorkbooks:true}:{}),
      fontPolicy: {basis: 'design', families: [input.brand.font.family]},
      verifyArtifactToolImport: true,
      receiptPath: validationPath,
    });
    if(native){
      const evidence=native.verifyFinal(deckPath),nativeChartProofPath=path.join(buildDir,'native-chart-proof.json');
      await fs.writeFile(nativeChartProofPath,JSON.stringify(evidence,null,2)+'\n');
      const objectCoveragePath=path.join(buildDir,'object-coverage.json');
      const coverage=verifyNativeObjectCoverage(deckPath,input,plan,manifestPath,nativeChartProofPath);
      jsonWireSize(coverage,coverage.schemaVersion===coveragePolicy.completeVersion?coveragePolicy.completeNumericOutputBytes:coveragePolicy.legacyNumericOutputBytes);
      await fs.writeFile(objectCoveragePath,JSON.stringify(coverage));
      return {objectCoveragePath,status:'engineering-only-unit3a',deckPath,draftPath,renderPaths,manifestPath,validationPath,nativeChartProofPath,objectCoverageComplete:true,fontCoverageComplete:false,pdfVerified:false,anchorVerified:false,finalAuthority:false,nativeExecutionAvailable:false};
    }
    const objectCoveragePath=path.join(buildDir,'object-coverage.json');
    await promisify(execFile)(pythonExecutable,[fileURLToPath(new URL('./object-coverage.py',import.meta.url)),'--deck',deckPath,'--manifest',manifestPath,'--output',objectCoveragePath],{maxBuffer:4*1024*1024});
    return {deckPath, draftPath, renderPaths, manifestPath, validationPath,objectCoveragePath};
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
