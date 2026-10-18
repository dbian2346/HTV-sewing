import './style.css';
import { mountQuickMeasurements, lengthKey, type QuickDesign } from './quick-measurements.js';
import { mountFabricControls } from './fabric.js';
import { mountOnboarding } from './onboarding.js';
import { profileValue, type MeasurementProfile } from './measurement-profile.js';
import { generateStudioPattern as generatePattern, exportStudioSVG as exportSVG, exportStudioPDF as exportPDF,
  planTiles, PAPER_SIZES, formatMM, isPenelopeSpec, isFreeSewingSpec, type StudioPattern as Pattern,
  type StudioSpec as PatternSpec, type PenelopeSpec, type CatalogSpec } from '../src/index.js';
import { ZodError } from 'zod';
import { garmentIntentSchema, type GarmentIntent } from '../src/photo-intent.js';
import { mountFittedForm, readFittedForm, fittedExample, fittedPaths, fittedNames } from './fitted-form.js';

import { catalogEntries, catalogExample, mountCatalogForm, readCatalogForm, writeCatalogForm, catalogPaths, catalogNames } from './catalog-form.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('pattern-form');
const paper = $<HTMLSelectElement>('paper-size');
const pieceSelect = $<HTMLSelectElement>('piece-select');
const json = $<HTMLTextAreaElement>('json-input');
const ruffle = $<HTMLInputElement>('ruffle-enabled');
const pdfButton = $<HTMLButtonElement>('download-pdf');
const svgButton = $<HTMLButtonElement>('download-svg');
const layoutButton = $<HTMLButtonElement>('download-layout');
const designSelect = $<HTMLInputElement>('design-select');
mountFittedForm($('freesewing-fields'));
let retainedCatalogSpec: CatalogSpec | null = null;
let retainedFittedSpec: PenelopeSpec | null = null;
let draftRevision = 0;
let pattern: Pattern | null = null;
let zoom = 1;
let pageCount: number | null = null;
let photoIntent: GarmentIntent | null = null;
let referenceFile: File | null = null;
let referenceURL: string | null = null;
let photoSessionId: string | null = null;
let photoMatch: { name: string; explanation: string; differences: string[]; confidence: string } | null = null;
let analysisRevision = 0;
let analysisAbort: AbortController | null = null;
let analyzing = false;
let measurementProfile: MeasurementProfile | null = null;
const fabricControls = mountFabricControls();
const generateFabricButton = $<HTMLButtonElement>('generate-from-fabric');
const generatePhotoButton = $<HTMLButtonElement>('generate-from-photo');
const fieldPaths: Record<string, string> = {
  'measurements.waist': 'waist', 'measurements.hip': 'hip',
  'garment.length': 'length', 'garment.fullnessRatio': 'fullnessRatio',
  'garment.waistband.finishedHeight': 'bandHeight', 'garment.waistband.elasticWidth': 'elasticWidth',
  'garment.waistband.hipEase': 'hipEase', 'garment.waistband.elasticLengthRatio': 'elasticLengthRatio',
  'garment.waistband.elasticOverlap': 'elasticOverlap', 'garment.waistband.elasticStretchRatio': 'elasticStretchRatio',
  'garment.ruffle.height': 'ruffleHeight', 'garment.ruffle.fullnessRatio': 'ruffleFullness',
  'construction.seamAllowance': 'seamAllowance', 'construction.hemAllowance': 'hemAllowance',
};
const fieldNames: Record<string, string> = {
  waist: 'Waist circumference', hip: 'Hip circumference', length: 'Finished length', fullnessRatio: 'Fullness ratio',
  bandHeight: 'Waistband height', elasticWidth: 'Elastic width', hipEase: 'Hip ease',
  elasticLengthRatio: 'Elastic length ratio', elasticOverlap: 'Elastic overlap', elasticStretchRatio: 'Usable elastic stretch',
  ruffleHeight: 'Ruffle height', ruffleFullness: 'Ruffle fullness', seamAllowance: 'Seam allowance', hemAllowance: 'Hem allowance',
};
const inputField = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const n = (name: string) => inputField(name).valueAsNumber;
const quickMeasurements = mountQuickMeasurements($('quick-measurements'));
let estimatedMeasurementKeys: string[] = [];
function currentQuickDesign():QuickDesign {
  if(designSelect.value === 'gathered_skirt')return {family:'skirt',required:['waist','hip'],baseline:{waist:760,hip:1020}};
  const baseline = designSelect.value === 'penelope' ? fittedExample() as PenelopeSpec : catalogExample(designSelect.value);
  const entry = catalogEntries.find(entry=>entry.designId===designSelect.value)!;
  return {family:entry.family,required:designSelect.value==='penelope'?Object.keys(baseline.measurements):entry.requiredMeasurements,baseline:baseline.measurements};
}
function configureQuickMeasurements(preferProfile=false) {
  const design=currentQuickDesign(),values:Record<string,number>={};
  const paths=designSelect.value==='gathered_skirt'?fieldPaths:designSelect.value==='penelope'?fittedPaths:catalogPaths;
  for(const [path,name] of Object.entries(paths))if(path.startsWith('measurements.')){
    const value=inputField(name).valueAsNumber;if(Number.isFinite(value))values[path.slice(13)]=value;
  }
  for(const key of ['shoulderToShoulder','chest','waist']){
    const value=profileValue(measurementProfile,key,designSelect.value);if((preferProfile||values[key]===undefined)&&value!==undefined)values[key]=value;
  }
  const length=designSelect.value==='gathered_skirt'?n('length'):values[lengthKey(design)??''];
  quickMeasurements.set(design,values,Number.isFinite(length)?length:undefined);
}
function syncQuickMeasurements() {
  const known={...measurementProfile?.measurements};
  if(designSelect.value==='gathered_skirt'&&known.seat!==undefined)known.hip=known.seat;
  const completed=quickMeasurements.complete(known,measurementProfile?.height_mm);
  estimatedMeasurementKeys=completed.estimated;
  $('quick-estimate-note').hidden=!estimatedMeasurementKeys.length;
  const paths=designSelect.value==='gathered_skirt'?fieldPaths:designSelect.value==='penelope'?fittedPaths:catalogPaths;
  for(const [key,value] of Object.entries(completed.measurements)){
    const name=paths[`measurements.${key}`];if(name)inputField(name).value=String(value);
  }
  if(designSelect.value==='gathered_skirt')inputField('length').value=String(quickMeasurements.entered().length!*10);
}


function readForm() {
  syncQuickMeasurements();
  if (!['gathered_skirt', 'penelope'].includes(designSelect.value)) return readCatalogForm(form, retainedCatalogSpec!);
  if (designSelect.value === 'penelope') return readFittedForm(form, retainedFittedSpec);
  return {
    measurements: { waist: n('waist'), hip: n('hip') },
    garment: { type: 'gathered_skirt', length: n('length'), fullnessRatio: n('fullnessRatio'),
      waistband: { finishedHeight: n('bandHeight'), elasticWidth: n('elasticWidth'), hipEase: n('hipEase'),
        elasticLengthRatio: n('elasticLengthRatio'), elasticOverlap: n('elasticOverlap'), elasticStretchRatio: n('elasticStretchRatio') },
      ruffle: { enabled: ruffle.checked, height: ruffle.checked ? n('ruffleHeight') : 120,
        fullnessRatio: ruffle.checked ? n('ruffleFullness') : 1.5 } },
    construction: { seamAllowance: n('seamAllowance'), hemAllowance: n('hemAllowance') },
  };
}
function writeForm(spec: PatternSpec) {
  const fitted = isPenelopeSpec(spec), free = isFreeSewingSpec(spec);
  designSelect.value = free ? spec.garment.designId : 'gathered_skirt';
  if (free && !fitted) {
    retainedCatalogSpec = spec;
    mountCatalogForm($('catalog-fields'), spec.garment.designId);
    writeCatalogForm(form, spec); paper.value = spec.print.paper;
  } else {
    if (fitted) { retainedFittedSpec = spec; paper.value = spec.print.paper; }
    for (const [path, name] of Object.entries(fitted ? fittedPaths : fieldPaths)) {
      let value: unknown = spec;
      for (const key of path.split('.')) value = (value as Record<string, unknown>)[key];
      if (inputField(name).type === 'checkbox') inputField(name).checked = Boolean(value);
      else inputField(name).value = value == null ? '' : String(value);
    }
    if (!free) ruffle.checked = spec.garment.ruffle.enabled;
  }
  setDesignVisibility();
  configureQuickMeasurements();
}
function setDesignVisibility() {
  const fitted = designSelect.value === 'penelope', gathered = designSelect.value === 'gathered_skirt';
  for (const [id, visible] of [['gathered-fields', gathered], ['freesewing-fields', fitted], ['catalog-fields', !gathered && !fitted]] as const) {
    $(id).hidden = !visible;
    $(id).querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => { input.disabled = !visible; });
  }
  if (gathered) setRuffleVisibility();
  const entry = catalogEntries.find(d => d.designId === designSelect.value);
  const title = gathered ? 'Gathered skirt' : fitted ? 'Penelope fitted skirt' : entry?.name ?? designSelect.value;
  const badge = document.createElement('span'); badge.className = 'template-tag'; badge.textContent = gathered ? '01' : fitted ? '02' : 'FS';
  $('garment-title').replaceChildren(document.createTextNode(title + ' '), badge);
  document.title = `Pattern Studio — ${title}`;
  $('garment-subtitle').textContent = gathered ? 'Matched automatically from your photo and drafted to your measurements.' : fitted ? 'A shaped FreeSewing draft, with darts, a back zipper, and clearly defined variations.' : 'An untested FreeSewing design. Choose measurements and design options to explore the draft.';
  $('design-description').textContent = gathered ? 'Elastic waist, optional gathered ruffle.' : fitted ? 'FreeSewing 3.1.0 · woven pencil skirt · fit sample required.' : `FreeSewing 4.10.2 · ${entry?.description ?? entry?.family ?? ''} · untested`;
}
function setRuffleVisibility() {
  $('ruffle-fields').hidden = !ruffle.checked;
  for (const name of ['ruffleHeight', 'ruffleFullness']) inputField(name).disabled = !ruffle.checked;
}
function clearErrors() {
  $('errors').hidden = true; $('errors').replaceChildren();
  form.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  form.querySelectorAll('.field-error-text').forEach(el => el.remove());
  form.querySelectorAll('[aria-invalid]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
}
function showErrors(error: unknown) {
  const box = $('errors');
  const heading = document.createElement('strong'); heading.textContent = 'A few things to check before we draft';
  const list = document.createElement('ul');
  const issues = error instanceof ZodError ? error.issues : [{ path: [], message: error instanceof Error ? error.message : 'Could not generate the pattern.' }];
  for (const issue of issues) {
    const name = (designSelect.value === 'penelope' ? fittedPaths : designSelect.value === 'gathered_skirt' ? fieldPaths : catalogPaths)[issue.path.join('.')];
    const key=issue.path[0]==='measurements'?String(issue.path[1]):issue.path.join('.')==='garment.length'?'length':'';
    const quickInput=[...$('quick-measurements').querySelectorAll<HTMLInputElement>('input')].find(input=>input.dataset.measurement===key);
    const unit=quickInput?.dataset.measurement==='shoulderSlope'?'°':'cm';
    const divisor=unit==='cm'?10:1;
    const issueMessage=quickInput&&'minimum' in issue?`Enter at least ${Number(issue.minimum)/divisor} ${unit}.`:quickInput&&'maximum' in issue?`Enter at most ${Number(issue.maximum)/divisor} ${unit}.`:issue.message;
    const li = document.createElement('li');
    li.textContent = `${name ? `${catalogNames[name] ?? fittedNames[name] ?? fieldNames[name]}: ` : ''}${issueMessage}`;
    list.append(li);
    if (quickInput || name) {
      const field = quickInput ?? inputField(name!), label = field.closest('.field, .fitted-checkbox')!;
      label.classList.add('field-error'); field.setAttribute('aria-invalid', 'true');
      const message = document.createElement('span'); message.className = 'field-error-text';
      message.id = `error-${quickInput?.name ?? name}`; message.textContent = issueMessage;
      label.append(message); field.setAttribute('aria-describedby', message.id);
      const details = field.closest('details'); if (details) details.open = true;
    }
  }
  box.replaceChildren(heading, list); box.hidden = false;
}
function updatePageCount() {
  pageCount = null;
  if (!pattern) return;
  try {
    const size = PAPER_SIZES[paper.value as keyof typeof PAPER_SIZES];
    const margin = pattern.pdfOptions.margin ?? 12, overlap = pattern.pdfOptions.overlap ?? 10;
    pageCount = pattern.pieces.reduce((count, piece) => count + planTiles(piece.width + 12, piece.height + 12,
      size.width - 2 * margin, size.height - 2 * margin, overlap).tiles.length, 1);
  } catch { pageCount = null; }
  $('summary-pages').replaceChildren();
  const number = document.createTextNode(pageCount === null ? '500+' : String(pageCount));
  const small = document.createElement('small'); small.textContent = 'incl. test square';
  $('summary-pages').append(number, small);
  pdfButton.disabled = pageCount === null || pageCount > 500;
  $('export-message').textContent = pdfButton.disabled ? 'This pattern exceeds the 500-sheet PDF limit. Reduce fullness or use the SVG export.' : '';
}
function summary(id: string, value: number, unit: string) {
  const small = document.createElement('small'); small.textContent = unit;
  $(id).replaceChildren(document.createTextNode(formatMM(value)), small);
}
function renderPreview() {
  if (!pattern) return;
  const selected = pattern.pieces.find(piece => piece.id === pieceSelect.value);
  $('piece-summary').textContent = selected ? `${selected.name} · ${selected.cuttingLabel ?? `CUT ${selected.cutQuantity}${selected.onFold ? ' ON FOLD' : selected.mirrored ? ' MIRRORED' : ''}`} · Sheet bounds ${formatMM(selected.width)} × ${formatMM(selected.height)} mm`
    : `${pattern.pieces.length} piece templates · Follow each piece’s cutting label · Preview zoom does not change print scale`;
  // Use the same SVG exporter as downloads; filtering changes only the preview layout.
  $('svg-container').innerHTML = exportSVG(selected ? { ...pattern, pieces: [selected] } : pattern);
  $('svg-container').hidden = false; $('canvas-empty').hidden = true;
  fitPreview();
}
function fitPreview() {
  const svg = $('svg-container').querySelector('svg'); if (!svg) return;
  const canvas = $('canvas');
  const { width, height } = svg.viewBox.baseVal;
  const padding = window.innerWidth <= 760 ? 40 : 60;
  const scale = Math.min((canvas.clientWidth - padding) / width, (canvas.clientHeight - padding) / height);
  svg.style.width = `${width * scale * zoom}px`; svg.style.height = `${height * scale * zoom}px`;
  $('zoom-label').textContent = zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`;
  $<HTMLButtonElement>('zoom-out').disabled = zoom <= 0.5;
  $<HTMLButtonElement>('zoom-in').disabled = zoom >= 4;
}
function render(p: Pattern) {
  draftRevision++;
  const sameDesign = pattern?.designId === p.designId;
  const selected = sameDesign ? pieceSelect.value : p.verification === 'untested' ? p.pieces[0]!.id : p.designId === 'penelope' ? 'penelope.front' : 'all';
  pattern = p;
  $('preview-legend').hidden = false;
  pieceSelect.replaceChildren(new Option('All pieces', 'all'), ...p.pieces.map(piece => new Option(piece.name, piece.id)));
  pieceSelect.value = p.pieces.some(piece => piece.id === selected) ? selected : 'all';
  const experimental = p.verification === 'untested';
  $('summary-first-label').textContent = experimental ? 'LARGEST SHEET' : 'FINISHED LENGTH';
  summary('summary-length', p.dimensions.finishedLength ?? Math.max(...p.pieces.map(piece => piece.height)), 'mm');
  summary('summary-pieces', p.pieces.length, p.designId === 'gathered_skirt' ? 'cut once each' : 'see native cutting labels');
  $('summary-third-label').textContent = experimental ? 'MEASUREMENTS' : p.designId === 'penelope' ? 'EASED WAIST' : 'ELASTIC CUT LENGTH';
  summary('summary-elastic', experimental ? Object.keys(p.spec.measurements).length : p.dimensions.elasticCutLength ?? p.dimensions.easedWaist!, experimental ? 'provided' : 'mm');
  $('native-legend').hidden = !experimental;
  document.querySelectorAll<HTMLElement>('.standard-legend').forEach(el => { el.hidden = experimental; });
  $('instructions').replaceChildren(...p.instructions.map(note => { const li = document.createElement('li'); li.textContent = note; return li; }));
  $('seam-checks').replaceChildren(...p.checks.map(check => { const line = document.createElement('p');
    line.className = 'seam-check'; line.textContent = `${check.name}: ${formatMM(check.differenceMm)} mm difference (limit ${check.toleranceMm} mm)`; return line; }));
  $('construction-callout').textContent = experimental ? 'This design is enabled for experimentation. Its integration, seams, cutting labels and fit have not been tested here. Follow the original design instructions and make a fit sample.' : p.designId === 'penelope' ? 'This fitted draft uses woven fabric, shaped darts and a back zipper. Check sitting and walking ease on a sewn toile before cutting final fabric. Seam checks do not establish fit.'
    : 'This is a rectangular draft for woven fabric. Check elastic comfort and stretch on the wearer, and make a test garment before cutting your final fabric.';
  json.value = JSON.stringify(p.spec, null, 2);
  $('json-message').textContent = '';
  $('draft-status').replaceChildren(document.createElement('span'), document.createTextNode(experimental ? ' Untested design' : p.designId === 'penelope' ? ' Seam checks passed' : ' Draft validated'));
  $('draft-status').classList.toggle('untested', experimental);
  if (isFreeSewingSpec(p.spec) && !isPenelopeSpec(p.spec)) retainedCatalogSpec = p.spec;
  if (isPenelopeSpec(p.spec)) retainedFittedSpec = p.spec;
  svgButton.disabled = false;
  layoutButton.disabled = false; $('layout-download').hidden = false;
  updatePageCount(); renderPreview();
  updateMapPieces();
  if(estimatedMeasurementKeys.length)$('draft-status').textContent='Estimated fit';
}
function invalidate() {
  draftRevision++;
  pattern = null; svgButton.disabled = pdfButton.disabled = true;
  layoutButton.disabled = true; $('layout-download').hidden = true;
  $('svg-container').hidden = true; $('canvas-empty').hidden = false;
  $('piece-summary').textContent = ''; $('seam-checks').replaceChildren();
  $('draft-status').textContent = 'Add your measurements';
  $('preview-legend').hidden = true;
  $('svg-container').replaceChildren();
  for (const id of ['summary-length', 'summary-pieces', 'summary-elastic', 'summary-pages']) $(id).textContent = '—';
  $('instructions').replaceChildren(); $('export-message').textContent = '';
  $('construction-callout').textContent = 'Generate a pattern to see its construction notes.';
  pageCount = null;
  updateMapPieces();
  refreshPhoneNavigation();
}
form.addEventListener('submit', e => e.preventDefault());
form.addEventListener('input', () => {
  clearErrors(); invalidate();
  $('match-result').hidden = true;
  $('canvas-empty').textContent = 'Your measurements or preferences changed. Find your pattern again to update the preview.';
  if (designSelect.value === 'gathered_skirt') setRuffleVisibility();
  updateIntentJSON();
});
pieceSelect.addEventListener('change', () => { zoom = 1; renderPreview(); });
paper.addEventListener('change', updatePageCount);
$('zoom-in').addEventListener('click', () => { zoom = Math.min(4, zoom + 0.25); fitPreview(); });
$('zoom-out').addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.25); fitPreview(); });
$('zoom-fit').addEventListener('click', () => { zoom = 1; fitPreview(); });
$('show-annotations').addEventListener('change', e => $('svg-container').classList.toggle('hide-annotations', !(e.target as HTMLInputElement).checked));
new ResizeObserver(fitPreview).observe($('canvas'));

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
function activateTab(tab: HTMLButtonElement) {
  for (const button of tabs) {
    const active = button === tab;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1; $(`panel-${button.dataset.tab}`).hidden = !active;
  }
  if (tab.dataset.tab === 'pattern') requestAnimationFrame(fitPreview);
}
tabs.forEach((button, index) => {
  button.addEventListener('click', () => activateTab(button));
  button.addEventListener('keydown', e => {
    const key = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    e.preventDefault();
    const next = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]!.focus(); activateTab(tabs[next]!);
  });
});
json.addEventListener('input', () => { $('json-message').textContent = 'Unapplied changes. Apply the specification to update your pattern and downloads.'; });
$('apply-json').addEventListener('click', async () => {
  clearErrors();
  if (!photoSessionId) { showErrors(new Error('Analyze your photo first.')); return; }
  const revision = draftRevision;
  try {
    const result = await apiPost<{ spec: PatternSpec; intent: GarmentIntent }>('/api/resolve', { sessionId: photoSessionId, settings: JSON.parse(json.value) });
    if (revision !== draftRevision) throw new Error('Inputs changed. Apply the specification again.');
    const p = generatePattern(result.spec);
    writeForm(p.spec); render(p); photoIntent = result.intent; updateIntentJSON(); showMatch(); setFlowStep('pattern');
    $('json-message').textContent = 'Specification applied. Your pattern and downloads are up to date.';
  } catch (error) { invalidate(); showErrors(error); $('json-message').textContent = 'Specification was not applied. Fix the errors and try again.'; }
});
$('copy-intent').addEventListener('click', async () => {
  const intentJSON = $<HTMLTextAreaElement>('intent-json');
  if (!intentJSON.value) { $('json-message').textContent = 'Analyze your photo first.'; return; }
  try { await navigator.clipboard.writeText(intentJSON.value); $('json-message').textContent = 'Garment intent JSON copied.'; }
  catch { intentJSON.focus(); intentJSON.select(); $('json-message').textContent = 'Press Ctrl+C or Command+C to copy the selected garment intent.'; }
});
$('copy-json').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(json.value); $('json-message').textContent = 'JSON copied to clipboard.'; }
  catch { json.focus(); json.select(); $('json-message').textContent = 'Press Ctrl+C or Command+C to copy the selected JSON.'; }
});
function download(bytes: BlobPart, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
svgButton.addEventListener('click', () => {
  if (!pattern) return;
    download(exportSVG(pattern), 'image/svg+xml', `${pattern.designId}.svg`);
  $('export-message').textContent = 'SVG downloaded.';
});
layoutButton.addEventListener('click', () => {
  if (!pattern) return;
  const fabric = fabricControls.read();
  if (!fabric) { showScreen('fabric'); return; }
  download(JSON.stringify({ ...pattern.layout, fabric, measurement_basis: { estimated_keys: estimatedMeasurementKeys, method: estimatedMeasurementKeys.length ? 'standard_proportions' : measurementProfile?.source ?? 'manual' } }, null, 2), 'application/json', `${pattern.designId}-layout.json`);
  $('export-message').textContent = 'Layout JSON downloaded.';
});
pdfButton.addEventListener('click', async () => {
  const snapshot = pattern; if (!snapshot) return;
  const revision = draftRevision;
  const paperSize = paper.value as 'A4' | 'Letter';
  pdfButton.disabled = true; pdfButton.querySelector('span')!.textContent = 'Preparing PDF…';
  $('export-message').textContent = '';
  try {
    const bytes = await exportPDF(snapshot, { paperSize });
    if (revision !== draftRevision || snapshot !== pattern || paperSize !== paper.value) throw new Error('The pattern changed during export. Download again to use your latest settings.');
    download(new Uint8Array(bytes).buffer, 'application/pdf', `${snapshot.designId}-${paperSize}.pdf`);
    $('export-message').textContent = 'PDF downloaded.';
  } catch (error) { $('export-message').textContent = error instanceof Error ? error.message : 'PDF export failed. Please try again.'; }
  finally { pdfButton.querySelector('span')!.textContent = 'Download PDF & Cutting Guide'; pdfButton.disabled = !pattern || pageCount === null || pageCount > 500; }
});
const guide = $<HTMLDialogElement>('print-guide');
$('help-button').addEventListener('click', () => {
  const steps = guide.querySelectorAll('li');
  steps[3]!.textContent = `Print the remaining pages at the same scale. Trim the white margins and align the repeated crosses in the ${pattern?.pdfOptions.overlap ?? 10} mm overlap. With zero overlap, butt the trimmed frames together.`;
  steps[4]!.textContent = pattern?.verification === 'untested' ? 'Assemble each piece by row and column. Follow the original design’s material-specific CUT, FOLD, BIAS and grain markings, then cut along its seam-allowance outline.' : pattern?.designId === 'penelope' ? 'Assemble each piece by row and column. Follow the CUT / FOLD labels: front once on fold, back as a mirrored pair, and the optional waistband once on its short-edge fold.'
    : 'Assemble each piece by row and column, then cut along the solid line. Cut every labeled fabric piece once on a single layer.';
  guide.showModal();
});
$('close-guide').addEventListener('click', () => guide.close());
$('guide-done').addEventListener('click', () => guide.close());
guide.addEventListener('click', e => { if (e.target === guide) { const r = guide.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) guide.close(); } });
function setFlowStep(id: string) {
  for (const step of ['photo', 'analysis', 'fabric', 'pattern']) {
    $(`step-${step}`).classList.toggle('active', step === id);
    if (step === id) $(`step-${step}`).setAttribute('aria-current', 'step');
    else $(`step-${step}`).removeAttribute('aria-current');
  }
  if (id === 'photo') showScreen('photo');
  if (id === 'measure') showScreen('customize');
  if (id === 'pattern') showScreen('pattern');
}
type PhoneScreen = 'photo' | 'customize' | 'measure' | 'fabric' | 'pattern';
function showScreen(screen: PhoneScreen) {
  document.body.dataset.screen = screen;
  const connector = document.querySelector<HTMLImageElement>('.step-connector img')!;
  connector.src = screen === 'fabric' || screen === 'pattern' ? `/assets/${screen}-imgGroup6.svg` : '/assets/imgGroup6.svg';
  const titles = { photo: 'Inspiration', customize: 'Customize', measure: 'Customize', fabric: 'Fabric', pattern: 'Pattern & Cutting Layout' };
  $('screen-title').textContent = titles[screen];
  $('screen-description').textContent = screen === 'photo'
    ? 'Upload a photo of clothing you love — from your camera roll, a fitting room snapshot, or a Pinterest pin.'
    : '';
  document.title = `Sewberry — ${titles[screen]}`;
  refreshPhoneNavigation();
  $('continue-measurements').hidden = false;
  $('pattern-settings').hidden = screen !== 'measure' && screen !== 'customize';
  $('measurement-source').hidden = measurementProfile?.source !== 'photo_estimate';
  window.scrollTo(0, 0);
  if (screen === 'pattern') requestAnimationFrame(fitPreview);
}
function refreshPhoneNavigation() {
  const screen = (document.body.dataset.screen ?? 'photo') as PhoneScreen;
  const order: PhoneScreen[] = ['photo', 'customize', 'fabric', 'pattern'];
  const activeScreen = screen === 'measure' ? 'customize' : screen;
  generateFabricButton.disabled = !photoSessionId || analyzing;
  document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(button => {
    const target = button.dataset.screen as PhoneScreen;
    button.disabled = false;
    const li = button.closest('li');
    li?.classList.toggle('active', target === activeScreen);
    li?.classList.toggle('done', order.indexOf(target) < order.indexOf(activeScreen));
    if (target === activeScreen) li?.setAttribute('aria-current', 'step');
    else li?.removeAttribute('aria-current');
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach(button => {
  button.addEventListener('click', () => showScreen(button.dataset.screen as PhoneScreen));
});
function updateMapPieces() {
  $('map-piece-count').textContent = pattern ? `${pattern.pieces.length} piece templates` : 'No pieces yet';
  $('pattern-piece-list').replaceChildren(...(pattern?.pieces ?? []).map(piece => {
    const li = document.createElement('li');
    li.textContent = `${piece.name} · ${piece.cuttingLabel ?? `Cut ${piece.cutQuantity}`} · ${formatMM(piece.width)} × ${formatMM(piece.height)} mm`;
    return li;
  }));
  if (!pattern) $('pattern-piece-list').textContent = 'Generate a pattern to see its pieces.';
}
const pieceDialog = $<HTMLDialogElement>('piece-list-dialog');
$('open-piece-list').addEventListener('click', () => { updateMapPieces(); pieceDialog.showModal(); });
$('close-piece-list').addEventListener('click', () => pieceDialog.close());
$('map-fullscreen').addEventListener('click', () => {
  const map = document.querySelector<HTMLElement>('.pattern-map')!;
  const expanded = map.classList.toggle('expanded');
  $('map-fullscreen').textContent = expanded ? 'Close Full Screen' : '🔍 Full Screen';
  requestAnimationFrame(fitPreview);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.querySelector('.pattern-map.expanded')) $('map-fullscreen').click();
});
$('open-cutting-steps').addEventListener('click', () => {
  $<HTMLDetailsElement>('pattern-tools').open = true;
  activateTab($<HTMLButtonElement>('tab-instructions'));
  $('pattern-tools').scrollIntoView({behavior:'smooth',block:'start'});
});
$('continue-measurements').addEventListener('click', () => showScreen('measure'));
$('edit-inspiration').addEventListener('click', () => showScreen('photo'));
$('nav-home').addEventListener('click', () => showScreen('photo'));
$('take-photo').addEventListener('click', () => {
  const input = $<HTMLInputElement>('reference-photo');
  input.setAttribute('capture', 'environment'); input.click();
});
document.querySelector('label[for="reference-photo"]')!.addEventListener('click', () => {
  $('reference-photo').removeAttribute('capture');
});
// Keep the existing numeric fields and validation, with Figma's phone stepper controls.
function enhanceMeasurementFields() {
  form.querySelectorAll<HTMLInputElement>('.input-wrap input[type="number"]').forEach(input => {
    const wrap = input.parentElement!;
    if (wrap.querySelector('.stepper')) return;
    for (const delta of [-1, 1]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'stepper'; button.textContent = delta < 0 ? '−' : '+';
      button.setAttribute('aria-label', `${delta < 0 ? 'Decrease' : 'Increase'} ${catalogNames[input.name] ?? fittedNames[input.name] ?? fieldNames[input.name] ?? input.name}`);
      button.addEventListener('click', () => {
        if (input.disabled) return;
        const value = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : Number(input.min) || 0;
        const step = input.step === 'any' ? (wrap.querySelector('span')?.textContent === 'mm' ? 5 : .1) : Number(input.step) || 1;
        const next = Math.round((value + delta * step) * 1000) / 1000;
        input.value = String(Math.max(input.min ? Number(input.min) : -Infinity, Math.min(input.max ? Number(input.max) : Infinity, next)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      if (delta < 0) wrap.prepend(button); else wrap.append(button);
    }
  });
}
new MutationObserver(enhanceMeasurementFields).observe(form, { childList: true, subtree: true });
enhanceMeasurementFields();
function formMeasurements() {
  syncQuickMeasurements();
  const paths = designSelect.value === 'gathered_skirt' ? fieldPaths : designSelect.value === 'penelope' ? fittedPaths : catalogPaths;
  const measurements: Record<string, number> = {};
  for (const [path, name] of Object.entries(paths)) {
    if (!path.startsWith('measurements.')) continue;
    const input = inputField(name);
    if (!input.disabled && Number.isFinite(input.valueAsNumber) && input.valueAsNumber > 0) measurements[path.slice(13)] = input.valueAsNumber;
  }
  return measurements;
}
function updateIntentJSON() {
  if (!photoIntent) { $<HTMLTextAreaElement>('intent-json').value = ''; return; }
  photoIntent = { ...photoIntent, measurements: formMeasurements(), preferences: {
    finishedLengthMm: designSelect.value === 'gathered_skirt' && Number.isFinite(n('length')) && n('length') > 0 ? n('length') : null,
    notes: $<HTMLTextAreaElement>('photo-notes').value,
  } };
  $<HTMLTextAreaElement>('intent-json').value = JSON.stringify(photoIntent, null, 2);
}
async function apiPost<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  let result: { error?: string; issues?: ZodError['issues'] };
  try { result = await response.json(); } catch { throw new Error('The local Gemini server is unavailable. Start it with npm run dev.'); }
  if (!response.ok) { if (result.issues) throw new ZodError(result.issues); throw new Error(result.error || 'Photo analysis failed.'); }
  return result as T;
}
function resetPhotoResult() {
  analysisAbort?.abort(); analysisAbort = null; analysisRevision++; analyzing = false;
  photoIntent = null; photoSessionId = null; photoMatch = null; generatePhotoButton.disabled = true;
  clearErrors(); invalidate();
  $('pattern-settings').hidden = $('analysis-card').hidden = $('match-result').hidden = true;
  document.body.classList.add('awaiting-photo');
  $('garment-title').textContent = 'Your photo. Your pattern.';
  $('garment-subtitle').textContent = 'Start with a reference. Add your measurements. We find the closest supported design.';
  document.title = 'Pattern Studio — From photo to pattern';
  $('canvas-empty').textContent = 'Your pattern will appear here after you add a photo and measurements.';
  $('draft-status').textContent = 'Waiting for a photo';
  $('analyze-photo').textContent = 'Analyze my photo';
  $('photo-status').textContent = '';
  json.value = ''; $('json-message').textContent = ''; updateIntentJSON(); setFlowStep('photo');
}
$<HTMLInputElement>('reference-photo').addEventListener('change', e => {
  resetPhotoResult(); referenceFile = null;
  document.body.classList.remove('has-photo');
  if (referenceURL) URL.revokeObjectURL(referenceURL);
  referenceURL = null;
  $<HTMLImageElement>('reference-preview').removeAttribute('src');
  $('reference-preview').hidden = true; $('upload-placeholder').hidden = false;
  $<HTMLButtonElement>('analyze-photo').disabled = true;
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) { $('photo-status').textContent = ''; return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0) {
    $('photo-status').textContent = 'Choose a JPG, PNG or WebP image between 1 byte and 8 MB.'; return;
  }
  referenceFile = file; referenceURL = URL.createObjectURL(file);
  const image = $<HTMLImageElement>('reference-preview');
  image.onload = () => { image.hidden = false; $('upload-placeholder').hidden = true;
    document.body.classList.add('has-photo');
    $<HTMLButtonElement>('analyze-photo').disabled = false;
    $('photo-status').textContent = ''; };
  image.onerror = () => { referenceFile = null; image.hidden = true; $('upload-placeholder').hidden = false;
    $('photo-status').textContent = 'This image could not be opened. Please choose another file.'; };
  image.src = referenceURL;
});
interface AnalysisResult {
  status: 'matched' | 'needs_clarification' | 'unsupported'; intent: GarmentIntent; summary: string;
  sessionId?: string; pendingSpec?: PatternSpec; clarificationQuestions?: string[];
  explanation?: string; match?: NonNullable<typeof photoMatch>;
}
$('analyze-photo').addEventListener('click', async () => {
  if (!referenceFile || analyzing) return;
  const priorMeasurements = photoIntent ? Object.fromEntries(Object.entries(quickMeasurements.entered()).filter(([key,value])=>key!=='length'&&Number.isFinite(value)).map(([key,value])=>[key,value*10])) : {};
  const priorLength = photoIntent?.preferences.finishedLengthMm;
  resetPhotoResult();
  const revision = analysisRevision, file = referenceFile;
  const controller = new AbortController(); analysisAbort = controller; analyzing = true;
  const button = $<HTMLButtonElement>('analyze-photo'); button.disabled = true; button.textContent = 'Analyzing';
  $('photo-status').textContent = '';
  $('draft-status').textContent = 'Analyzing photo…'; setFlowStep('analysis');
  try {
    const data = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file); });
    const result = await apiPost<AnalysisResult>('/api/analyze', { filename: file.name, mimeType: file.type, data, notes: $<HTMLTextAreaElement>('photo-notes').value }, controller.signal);
    if (revision !== analysisRevision) return;
    photoIntent = garmentIntentSchema.parse(result.intent);
    $('analysis-card').hidden = false;
    $('assistant-label').hidden = false;
    $('analysis-heading').textContent = photoIntent.observations.category;
    $('analysis-summary').textContent = result.summary;
    for (const [id, values] of [['analysis-features', photoIntent.observations.visibleFeatures], ['analysis-unknowns', [...photoIntent.observations.unknownFeatures, ...(result.clarificationQuestions || [])]]] as const)
      $(id).replaceChildren(...values.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    if (result.status !== 'matched' || !result.pendingSpec || !result.sessionId || !result.match) {
      $('photo-status').textContent = result.status === 'unsupported' ? (result.explanation || 'No useful supported design matches this reference. Try another photo or describe the intended garment.') : 'Add the requested details in your notes, then analyze again.';
      $('draft-status').textContent = result.status === 'unsupported' ? 'No supported match' : 'More detail needed';
      $<HTMLTextAreaElement>('intent-json').value = JSON.stringify(photoIntent,null,2); showScreen('customize'); return;
    }
    photoSessionId = result.sessionId; photoMatch = result.match;
    writeForm(result.pendingSpec);
    // Pending specifications contain no body measurements. Restore only exact user-entered keys.
    const paths = designSelect.value === 'gathered_skirt' ? fieldPaths : designSelect.value === 'penelope' ? fittedPaths : catalogPaths;
    for (const [path,name] of Object.entries(paths)) if (path.startsWith('measurements.')) {
      const key = path.slice(13);
      const value = priorMeasurements[key] ?? profileValue(measurementProfile, key, designSelect.value);
      inputField(name).value = value === undefined ? '' : String(value);
    }
    if (designSelect.value === 'gathered_skirt') inputField('length').value = priorLength ? String(priorLength) : '';
    configureQuickMeasurements();
    clearErrors(); invalidate(); generatePhotoButton.disabled = false;
    $('pattern-settings').hidden = false; document.body.classList.remove('awaiting-photo');
    $('garment-title').textContent = 'Let’s make it yours.';
    $('garment-subtitle').textContent = 'Your photo has been matched automatically. Add the measurements needed to draft your pattern.';
    document.title = 'Pattern Studio — Add your measurements';
    $('photo-status').textContent = '';
    $('canvas-empty').textContent = 'Add your measurements, then choose Draft my pattern.';
    $('draft-status').textContent = 'Waiting for measurements';
    json.value = ''; updateIntentJSON(); setFlowStep('measure');
  } catch (error) {
    if (revision !== analysisRevision || controller.signal.aborted) return;
    invalidate(); showErrors(error); $('photo-status').textContent = error instanceof Error ? error.message : 'Analysis failed. Try again.';
  } finally {
    if (revision === analysisRevision) { analyzing = false; analysisAbort = null; button.disabled = !referenceFile; button.textContent = 'Analyze my photo'; }
  }
});
$('photo-notes').addEventListener('input', () => {
  updateIntentJSON();
  if (!photoIntent && !analyzing) return;
  analysisAbort?.abort(); analysisRevision++; analyzing = false; photoSessionId = null; photoMatch = null;
  invalidate(); generatePhotoButton.disabled = true; $('match-result').hidden = true;
  $<HTMLButtonElement>('analyze-photo').disabled = !referenceFile; $('analyze-photo').textContent = 'Analyze my photo';
  $('photo-status').textContent = 'Analyze again to apply your changes.';
});
function showMatch() {
  if (!photoMatch) return;
  $('match-result').hidden = false;
  $('matched-name').textContent = photoMatch.name;
  $('matched-reason').textContent = `${photoMatch.explanation} Match confidence: ${photoMatch.confidence}.`;
  $('matched-differences').textContent = photoMatch.differences.join(' ');
}
generatePhotoButton.addEventListener('click', () => { if(quickMeasurements.valid()) { syncQuickMeasurements(); showScreen('fabric'); } });
generateFabricButton.addEventListener('click', async () => {
  if (!photoIntent || !photoSessionId || generateFabricButton.disabled) return;
  if (!quickMeasurements.valid(false)) { showScreen('measure'); quickMeasurements.valid(); return; }
  if (!fabricControls.read()) return;
  clearErrors(); updateIntentJSON();
  const revision = draftRevision; generatePhotoButton.disabled = generateFabricButton.disabled = true;
  try {
    const result = await apiPost<{ spec: PatternSpec; intent: GarmentIntent }>('/api/resolve', { sessionId: photoSessionId, settings: readForm() });
    if (revision !== draftRevision) throw new Error('Your inputs changed. Draft again to use the latest measurements.');
    const p = generatePattern(result.spec);
    writeForm(p.spec); render(p); photoIntent = result.intent; updateIntentJSON(); showMatch();
    $('photo-status').textContent = '';
    setFlowStep('pattern');
  } catch (error) { invalidate(); showErrors(error); $('match-result').hidden = true; }
  finally { generatePhotoButton.disabled = generateFabricButton.disabled = !photoSessionId || analyzing; }
});
configureQuickMeasurements();
resetPhotoResult();
const onboarding = mountOnboarding(profile => {
  measurementProfile = profile;
  if (photoSessionId) {
    const paths = designSelect.value === 'gathered_skirt' ? fieldPaths : designSelect.value === 'penelope' ? fittedPaths : catalogPaths;
    for (const [path, name] of Object.entries(paths)) if (path.startsWith('measurements.')) {
      const value = profileValue(profile, path.slice(13), designSelect.value);
      if (value !== undefined) inputField(name).value = String(value);
    }
    configureQuickMeasurements(true);
    form.dispatchEvent(new Event('input', {bubbles:true})); showScreen('measure');
  } else { configureQuickMeasurements(true); showScreen('photo'); }
}, () => showScreen('measure'));
$('open-photo-measurements').addEventListener('click', () => onboarding.editPhoto());
fetch('/api/health').then(async response => {
  if (!response.ok) throw new Error('unavailable'); const status = await response.json();
  if (!status.configured) $('photo-status').textContent = 'Gemini is not configured. Add GEMINI_API_KEY to .env and restart npm run dev.';
}).catch(() => { $('photo-status').textContent = 'Start the local Gemini server with npm run dev to analyze photos.'; });
