import { z } from 'zod';
export const observationsSchema = z.strictObject({
  category: z.string(), silhouette: z.string(), neckline: z.string().nullable(), sleeves: z.string().nullable(),
  waistTreatment: z.string().nullable(), apparentLength: z.string().nullable(),
  hemDetails: z.array(z.string()), closures: z.array(z.string()), visibleFeatures: z.array(z.string()), unknownFeatures: z.array(z.string()),
});
export const analysisSchema = z.strictObject({ status: z.enum(['analyzed', 'needs_clarification', 'unsupported']), summary: z.string(), observations: observationsSchema, clarificationQuestions: z.array(z.string()) });
export const matchSchema = z.strictObject({ status: z.enum(['matched', 'needs_clarification', 'unsupported']), designId: z.string().nullable(), confidence: z.enum(['low', 'medium', 'high']), explanation: z.string(), differences: z.array(z.string()), clarificationQuestions: z.array(z.string()), optionValues: z.array(z.strictObject({ key: z.string(), value: z.union([z.string(), z.number(), z.boolean()]), evidence: z.string() })) });
export async function geminiJSON(schema, prompt, image, { fetchImpl = fetch, apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key, model = process.env.GEMINI_MODEL || 'gemini-3.6-flash', signal } = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing. Add it to .env and restart npm run dev.');
  const jsonSchema = z.toJSONSchema(schema); delete jsonSchema.$schema;
  const parts = [{ text: prompt }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
  response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema, maxOutputTokens: 8192, ...(['gemini-3.6-flash','gemini-3.8-flash'].includes(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } }),
    signal: AbortSignal.any([AbortSignal.timeout(90_000), ...(signal ? [signal] : [])]),
  });
  if (![500,502,503].includes(response.status) || attempt === 1) break;
  await response.arrayBuffer();
  await new Promise(resolve => setTimeout(resolve, 1500));
  }
  const result = await response.json();
  if (!response.ok) {
    const messages = { 400: 'Gemini rejected the request. Check the image or configured GEMINI_MODEL.', 401: 'Gemini rejected the API key.', 403: 'This key does not have access to the Gemini API or model.', 404: 'The configured Gemini model is unavailable.', 429: 'Gemini quota or rate limit reached. Check the key’s quota or billing and try again.' };
    throw new Error(messages[response.status] || `Gemini request failed (${response.status}). Try again shortly.`);
  }
  const candidate = result.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw new Error(`Gemini did not complete the analysis (${candidate?.finishReason || result.promptFeedback?.blockReason || 'no response'}). Try another photo or a clearer description.`);
  const text = candidate.content?.parts?.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  if (!text) throw new Error('Gemini returned no analysis. Try a clearer garment photo.');
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new Error('Gemini returned an invalid structured response. Try the analysis again.'); }
}
