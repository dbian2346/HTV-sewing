# Photo-first pattern flow

The user supplies a reference photo, measurements and preferences. The application chooses a supported design automatically; the catalog is an implementation detail, not a menu the user must understand.

## Intended AI architecture

1. **Analyze the reference.** A vision model identifies the target garment, silhouette, neckline, sleeve construction, waist treatment, apparent length, hem, visible seams and closures. It records uncertainty and asks which garment to target if the photo is ambiguous. It does not estimate body measurements from pixels.
2. **Create neutral garment-intent JSON.** Combine the observations with measurements explicitly supplied by the user and requested changes. There is no `designId` at this stage. Observed details, desired changes and unknown details remain distinguishable.
3. **Match the catalog.** Compare the intent with `supported-designs.json`, including descriptions, visual features and supported variations. Select the closest useful supported design automatically. If candidates cannot be distinguished, ask a garment-detail question rather than asking the user to select a pattern name. If no useful match exists, explain the unsupported features.
4. **Collect any missing measurements.** Read the chosen design's requirements. Ask for missing measurements explicitly; do not substitute demo body sizes, infer measurements from a photo, or equate distinct measurements such as high hip and full seat.
5. **Resolve the drafting specification.** Map the intent to the selected adapter's measurement keys and supported options. Produce the existing FreeSewing v2 or custom gathered-skirt contract. Preserve the user's numeric measurements, convert units explicitly, and validate types, ranges and cross-field relationships.
6. **Draft and present the result.** Show the generated pieces and an explanation of the automatic match, including differences from the reference. Offer SVG/PDF output only after successful drafting. A supported starting point is not an exact reconstruction or a guarantee of fit.

The two JSON objects have different jobs:

| Object | Role | Design ID? |
| --- | --- | --- |
| Garment intent | Describe what the user wants and what is known | No |
| Resolved pattern specification | Supply executable settings to a registered drafting adapter | Yes, selected internally |

For example, an intent can say `category: "skirt"`, `silhouette: "gathered"`, `waistTreatment: "elastic"`, list a ruffled hem, and include the user's waist and hip measurements. The matcher can then select `gathered_skirt` and the resolver can map the length and ruffle variation into its engine contract.

## Local Gemini integration

Run `npm run dev` with `GEMINI_API_KEY` in the root `.env`. `GEMINI_MODEL` optionally overrides the default `gemini-3.6-flash`. The key stays on the local Node server, which binds only to `127.0.0.1:4173`. This is a local integration, not a hosted deployment.

**Analyze my photo** posts an image and notes to `/api/analyze`. The server makes two Gemini structured-output calls: one for neutral observations, then one to compare those observations with supported finished designs. Reusable libraries and foundation blocks are excluded from finished-garment matching. Unclear or unsupported results show clarification prompts or a no-match result. A successful match returns an opaque analysis-session ID, validated boolean/enum option suggestions, and a pending specification with an empty measurement object. Numeric options retain declared defaults until the user edits them.

The browser presents the selected design's required measurements. It does not display a design selector or substitute sample body sizes. **Draft my pattern** posts the session ID and filled settings to `/api/resolve`, which enforces the selected design and validates measurements, options and cross-field relationships using the registered adapter. Body measurements are not sent to Gemini. The browser then drafts the validated specification and produces previews and exports. Previously untested design adapters remain untested for garment fit.

Notes or photo changes invalidate the previous match. Clarifications can be supplied in the notes and the photo reanalyzed. User-supplied measurements are preserved by exact key when reanalyzing; distinct measurements are not silently equated. Measurement/style edits invalidate downloads until the user drafts again. Missing, expired or changed sessions cannot resolve a different design.

Images are held only during the API request and are not saved by this app. Analysis metadata lives in a bounded, 30-minute in-memory session map and disappears on restart. Uploads are limited to 8 MB and checked for matching PNG/JPEG/WebP signatures. API calls accept only local origins, the static server uses an asset allowlist, and `.env` is not served. Provider failures are reported without exposing the key. Temporary 500/502/503 responses get one retry; quota failures require the user to check quota or billing.

## Files

- `server/gemini.mjs`: Gemini HTTP transport, output schemas, timeouts and bounded retry.
- `server/photo-api.mjs`: image analysis, catalog matching, sessions and specification resolution.
- `scripts/local-server.mjs`: `.env` loading, loopback-only API server and fixed static routes.
- `src/photo-intent.ts` and `garment-intent.schema.json`: neutral intent contract. `analysisSource` distinguishes real `gemini` analysis from `demo` fixtures used only in tests.
- `web/main.ts` and `web/index.html`: upload, review, dynamic measurement form and result states.
- `supported-designs.json`: catalog descriptions and visual matching metadata.
- `src/studio.ts`: adapter dispatch for resolved engine input.
- `src/freesewing/catalog-runtime.ts`, `src/freesewing/schema.ts`, and `src/schema.ts`: adapter-specific validation.

Regenerate the intent schema with `npm run schema`. No GitHub push or hosted publication is performed by this integration.

The transport uses Google's documented [image inputs](https://ai.google.dev/gemini-api/docs/image-understanding) and [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Gemini 3.6 Flash was selected after a live synthetic-image check; the default uses the documented low thinking level. See [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking).
