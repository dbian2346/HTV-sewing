# Guest onboarding and photo measurements

The phone onboarding screens are implemented from the Hack The Valley Figma file through Figma MCP. The welcome and guest pages preserve the original illustrations and icons. Apple, Google and email buttons are disabled demo controls; **Explore as a guest** opens measurement setup. No registration, OAuth, email delivery or account persistence is configured.

Guests can enter chest, natural waist and full hips manually, or upload/take a full-body photo and supply only their standing height in centimeters. **Take Photo** opens a live `getUserMedia` camera preview with capture, front/rear switching and cancel controls. **Capture in 10s** starts a visible ten-second countdown before taking the photo; Cancel or leaving the page cancels the countdown. Camera access requires browser permission and a secure origin (localhost or HTTPS). The captured JPEG follows the same estimator upload path; the camera stops after capture, cancellation, navigation or hiding the page. Successful photo results open an editable review screen. The profile stays in this tab's memory and populates the measurements required by the subsequently matched pattern. Missing essential Customize inputs remain blank. Garment preferences such as desired finished length remain separate from body measurements.

The body estimator is adapted from [shroomshroom900/SewBerry](https://github.com/shroomshroom900/SewBerry), commit `a64cae1`, which contains `body-dimension-estimator.zip`. The checkout and unpacked source are in `SewBerry/`. Its 38 landmark definitions are retained in `server/measurement-landmarks.json`. The existing MVP's server-side Gemini transport is reused instead of installing the archive's separate React/Vite/Express application.

Differences from the upstream estimator:

- There is no silent fallback to height-ratio/population-average measurements when vision fails or a landmark is missing.
- Returned values are explicitly photo **estimates**, with confidence and a review step. A single photograph does not establish body depth/circumferences exactly.
- Unavailable measurements are omitted; the vision response does not invent them. The simplified Customize adapter separately completes secondary drafting dimensions with labeled standard-proportion estimates.
- Engine values use millimeters. Shoulder slope uses degrees; full seat and high-hip circumferences are kept distinct. The gathered skirt's `hip` maps to the full seat circumference.
- Heights, image signatures, MIME types, upload size, returned keys, duplicates, units and numeric bounds are validated. Photos are not saved by this application. The photo is sent to Gemini only when the guest chooses **Estimate measurements**, and the UI states that destination.
- Body photos are separate from garment-inspiration photos. Raw body image data is discarded from the UI after completion/cancellation. Changing height or photo invalidates an in-flight estimate.

## Server contract

`POST /api/measure` is hosted by the existing localhost server and uses the same local-origin checks and JSON size limit as the garment endpoints.

```json
{
  "heightCm": 170,
  "mimeType": "image/png",
  "imageBase64": "BASE64_BYTES_WITHOUT_DATA_URL_PREFIX"
}
```

The response contains `source: "photo_estimate"`, `height_mm`, a `measurements` record keyed by FreeSewing measurement names, per-key `confidence`, `missing_keys` and `requires_review: true`.

It uses the existing `GEMINI_API_KEY` and optional `GEMINI_MODEL` in the local server environment. No credentials belong in browser code. Provider failures return an actionable error and leave manual entry available.

Run `npm run dev` from the main MVP directory. Tests use mocked vision responses; no real body photos or paid provider calls are needed for validation.

## Phone navigation

Top navigation is Inspiration → Customize → Fabric → Pattern, and every step remains directly accessible. Pattern-specific measurements and the photo measurement editor live under Customize. Continue to Fabric opens the fabric settings, where Generate Pattern uses the existing matching/drafting flow.

## Reduced Customize inputs

Tops expose only shoulder-to-shoulder, chest, and waist; bottoms expose only length and waist. Values are entered in centimeters and converted once to millimeters at the drafting boundary. Existing engine schemas, SVG/PDF scale and optimizer piece geometry remain in millimeters. Accessories retain their relevant inputs, shown in centimeters (angles remain degrees).

Exact entered values override saved/photo profile values. Missing secondary required dimensions use the existing demo body's proportions, scaled by the entered waist/chest and vertical scale (saved height, shoulder width, or trouser length as applicable). These are explicitly tagged **Estimated proportions** in Customize and **Estimated fit** in the pattern tools. They are estimates, not measurements or a verified custom fit. Photo-estimation failures still do not fabricate a successful vision response. Downloaded layout JSON records `measurement_basis.estimated_keys` and its method alongside the fabric inputs.
