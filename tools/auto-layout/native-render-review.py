#!/usr/bin/env python3
from native_manifest import read_native_manifest_file
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

import pypdfium2 as pdfium
from PIL import Image


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')


def require(condition, code):
    if not condition:
        raise ValueError(code)


def file_binding(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    return {'path': str(path), 'sha256': sha(raw), 'bytes': len(raw)}


def check_file(binding):
    require(file_binding(binding['path']) == binding, 'stale-or-missing-file-binding')


def check_automation(out):
    report = load(out/'verification.json')
    require(report.get('schemaVersion') in ('native-font-verification.v2', 'native-font-verification.v3', 'native-font-verification.v4'), 'unsupported-verification-version')
    checked = read_native_manifest_file(out/'inputs/layout.json')
    require(bool(checked['transportVersion']) == (report['schemaVersion'] == 'native-font-verification.v4'), 'layout-transport-mismatch')
    if report['schemaVersion'] == 'native-font-verification.v4':
        require(checked['transportVersion'] and report.get('semanticFontVersion') in ('native-font-verification.v2', 'native-font-verification.v3') and report.get('layoutTransport') == checked['transport'] and report.get('layoutOriginal') == checked['original'], 'layout-transport-mismatch')
    expectation = report['expectation']
    if report['schemaVersion'] == 'native-font-verification.v4':
        require(expectation.get('layoutTransport') == report['layoutTransport'] and expectation.get('layoutOriginal') == report['layoutOriginal'], 'expectation-transport-mismatch')
    require(expectation is not None, 'missing-source-expectation')
    for key, binding in expectation['inputs'].items():
        path = out/'inputs'/('deck.pptx' if key == 'deck' else key+'.json')
        require(sha(path.read_bytes()) == binding['sha256'], 'stale-input-'+key)
    for binding in expectation['fonts'].values():
        require(sha(Path(binding['snapshot']).read_bytes()) == binding['sha256'], 'stale-font-resource')
    require(sha((out/'deck.pdf').read_bytes()) == report['outputs']['deck.pdf']['sha256'], 'stale-pdf')
    require(sha((out/'inputs/deck.pptx').read_bytes()) == report['checkedDeckSha256'], 'stale-deck')
    require(report['passed'] is False and report['visualInspection']['status'] == 'pending', 'invalid-automation-authority')
    return report


def prepare(out, author, max_pages=100, max_pixels=80000000):
    report = check_automation(out)
    renderdir = out/'review-pages'
    renderdir.mkdir()
    raw = (out/'deck.pdf').read_bytes()
    renderer = {'engine': 'PDFium', 'pypdfium2': importlib.metadata.version('pypdfium2'),
                'pdfium': str(pdfium.PDFIUM_INFO), 'maxDimension': 1600, 'format': 'PNG',
                'flags': 'pypdfium2 default opaque full-page render'}
    pages, planned_pixels = [], 0
    with pdfium.PdfDocument(raw) as document:
        require(len(document) == len(report['expectation']['pages']), 'page-count-mismatch')
        plan = []
        for number in range(len(document)):
            page = document[number]
            try:
                width, height = page.get_size()
                scale = 1600/max(width, height)
                import math
                dimensions = [math.ceil(width*scale), math.ceil(height*scale)]
                planned_pixels += dimensions[0]*dimensions[1]
                plan.append({'page': number+1, 'pdfPoints': [width, height], 'scale': scale, 'dimensions': dimensions})
            finally:
                page.close()
        manifest = {'schemaVersion': 'native-render-review-manifest.v1', 'authorTaskId': author,
                    'inputs': report['expectation']['inputs'], 'deck': file_binding(out/'inputs/deck.pptx'),
                    'pdf': file_binding(out/'deck.pdf'), 'automation': file_binding(out/'verification.json'),
                    'renderer': renderer, 'pageCount': len(document), 'pages': pages,
                    'budget': {'maxPages': max_pages, 'maxPixels': max_pixels, 'plannedRenders': len(document),
                               'plannedPixels': planned_pixels, 'completedRenders': 0, 'completedPixels': 0},
                    'status': 'incomplete', 'visualInspection': 'pending'}
        if report['schemaVersion'] == 'native-font-verification.v4':
            manifest.update(layoutTransport=report['layoutTransport'], layoutOriginal=report['layoutOriginal'])
        if len(document) > max_pages or planned_pixels > max_pixels:
            manifest['reason'] = 'budget-exhausted-before-render'
            save(out/'review-manifest.json', manifest)
            return manifest
        try:
            for item in plan:
                page = document[item['page']-1]
                try:
                    bitmap = page.render(scale=item['scale'])
                    try:
                        image = bitmap.to_pil()
                        target = renderdir/f"page-{item['page']:03d}.png"
                        image.save(target)
                        require(list(image.size) == item['dimensions'], 'unexpected-render-dimensions')
                    finally:
                        bitmap.close()
                finally:
                    page.close()
                pages.append({**item, 'image': file_binding(target), 'requiredRuns': report['expectation']['pages'][item['page']-1]['runs']})
                if report.get('semanticFontVersion', report['schemaVersion']) == 'native-font-verification.v3':
                    pages[-1]['requiredRegions'] = report['expectation']['pages'][item['page']-1]['regions']
                manifest['budget']['completedRenders'] += 1
                manifest['budget']['completedPixels'] += item['dimensions'][0]*item['dimensions'][1]
            manifest['status'] = 'complete'
        except Exception as error:
            manifest['reason'] = str(error)
        save(out/'review-manifest.json', manifest)
        return manifest


def validate_manifest(out):
    manifest = load(out/'review-manifest.json')
    require(manifest['schemaVersion'] == 'native-render-review-manifest.v1', 'manifest-schema')
    require(manifest['status'] == 'complete', 'incomplete-render-evidence')
    require(manifest['visualInspection'] == 'pending', 'manifest-cannot-approve-review')
    report = check_automation(out)
    require(manifest['inputs'] == report['expectation']['inputs'], 'input-identity-mismatch')
    if report['schemaVersion'] == 'native-font-verification.v4':
        require(manifest.get('layoutTransport') == report['layoutTransport'] and manifest.get('layoutOriginal') == report['layoutOriginal'], 'render-transport-mismatch')
    for key in ('pdf', 'deck', 'automation'):
        check_file(manifest[key])
    require(manifest['pdf']['path'] == str((out/'deck.pdf').resolve()), 'pdf-path-mismatch')
    require(manifest['deck']['path'] == str((out/'inputs/deck.pptx').resolve()), 'deck-path-mismatch')
    require(manifest['automation']['path'] == str((out/'verification.json').resolve()), 'automation-path-mismatch')
    require(len(manifest['pages']) == manifest['pageCount'] == len(report['expectation']['pages']), 'incomplete-page-coverage')
    require([p['page'] for p in manifest['pages']] == list(range(1, manifest['pageCount']+1)), 'page-identity-mismatch')
    require(len({p['image']['path'] for p in manifest['pages']}) == manifest['pageCount'], 'duplicate-page-image')
    for page, expected in zip(manifest['pages'], report['expectation']['pages']):
        check_file(page['image'])
        require(page['requiredRuns'] == expected['runs'], 'required-occurrence-mapping-mismatch')
        if report.get('semanticFontVersion', report['schemaVersion']) == 'native-font-verification.v3':
            require(page.get('requiredRegions') == expected['regions'], 'required-region-mapping-mismatch')
        with Image.open(page['image']['path']) as image:
            require(list(image.size) == page['dimensions'], 'image-dimensions-mismatch')
    return manifest, report


def record(out, observations):
    manifest, report = validate_manifest(out)
    require(observations['schemaVersion'] == 'native-render-observations.v1', 'review-schema')
    require(observations['manifestSha256'] == sha((out/'review-manifest.json').read_bytes()), 'stale-review-manifest')
    require(observations['pdfSha256'] == manifest['pdf']['sha256'], 'stale-review-pdf')
    reviewer = observations['reviewerTaskId']
    require(isinstance(reviewer, str) and reviewer.strip() and reviewer != manifest['authorTaskId'], 'author-cannot-review-own-output')
    require(observations['scope'] == 'internal-render-observation', 'invalid-review-scope')
    require(len(observations['pages']) == manifest['pageCount'], 'incomplete-review-record')
    defects = []
    for page, observation in zip(manifest['pages'], observations['pages']):
        require(observation['page'] == page['page'] and observation['imageSha256'] == page['image']['sha256'], 'review-page-identity-mismatch')
        require(observation['status'] in ('observed_pass', 'observed_defect', 'unknown'), 'invalid-observation-status')
        require(isinstance(observation['observations'], str) and observation['observations'].strip(), 'missing-page-observations')
        require(observation['checkedRequiredRuns'] == page['requiredRuns'], 'review-required-occurrence-mapping-mismatch')
        if report.get('semanticFontVersion', report['schemaVersion']) == 'native-font-verification.v3':
            require(observation.get('checkedRequiredRegions') == page['requiredRegions'], 'review-required-region-mapping-mismatch')
        invocation = observation['viewImageEvidence']
        require(invocation['tool'] == 'view_image' and invocation['imagePath'] == page['image']['path'], 'missing-exact-view-image-invocation')
        require(isinstance(invocation['invocationId'], str) and invocation['invocationId'].strip(), 'missing-view-image-invocation-id')
        check_file(invocation['retainedEvidence'])
        require(invocation['retainedEvidence']['bytes'] > 0, 'empty-review-evidence')
        require(isinstance(observation['defects'], list), 'invalid-defect-list')
        require((observation['status'] == 'observed_defect') == bool(observation['defects']), 'defect-status-mismatch')
        if observation['defects']:
            defects.append({'page': page['page'], 'defects': observation['defects']})
    all_observed = all(p['status'] == 'observed_pass' for p in observations['pages'])
    result = {'schemaVersion': 'native-render-review-record.v1', 'manifestSha256': observations['manifestSha256'],
              'declaredProvenance': observations, 'authority': 'unsigned-local-record-unverified',
              'visualInspection': 'local-recorded-unverified' if all_observed else 'incomplete',
              'deliveryStatus': 'blocked' if defects or not report['automationPassed'] else 'pending',
              'observedDefects': defects, 'passed': False,
              'limitation': 'Local caller evidence cannot authenticate reviewer or grant project approval. Independent root reviewer must inspect exact retained images and actual tool invocation evidence.'}
    save(out/'local-review-record.json', result)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=('prepare', 'record', 'validate'))
    parser.add_argument('--out', required=True)
    parser.add_argument('--author-task-id')
    parser.add_argument('--observations')
    parser.add_argument('--max-pages', type=int, default=100)
    parser.add_argument('--max-pixels', type=int, default=80000000)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    try:
        if args.operation == 'prepare':
            require(bool(args.author_task_id and args.author_task_id.strip()), 'missing-author-task-identity')
            require(args.max_pages > 0 and args.max_pixels > 0, 'invalid-render-budget')
            result = prepare(out, args.author_task_id, args.max_pages, args.max_pixels)
            print(json.dumps({'renderStatus': result['status'], 'visualInspection': 'pending', 'budget': result['budget']}))
            return 0 if result['status'] == 'complete' else 1
        if args.operation == 'record':
            result = record(out, load(args.observations))
            print(json.dumps({k: result[k] for k in ('authority', 'visualInspection', 'deliveryStatus', 'passed')}))
            return 0 if result['deliveryStatus'] != 'blocked' else 1
        manifest, report = validate_manifest(out)
        print(json.dumps({'renderStatus': manifest['status'], 'automationPassed': report['automationPassed'], 'visualInspection': 'pending', 'passed': False}))
        return 0
    except Exception as error:
        print(json.dumps({'deliveryStatus': 'blocked', 'visualInspection': 'pending', 'passed': False, 'error': str(error)}))
        return 1

if __name__ == '__main__':
    sys.exit(main())
