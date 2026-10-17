import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { inputSchema } from '../src/schema.js';
import { garmentIntentSchema } from '../src/photo-intent.js';
import { penelopeInputSchema } from '../src/freesewing/schema.js';
const schema = z.toJSONSchema(inputSchema, { io: 'input' });
await writeFile('gathered-skirt.schema.json', JSON.stringify({ ...schema,
  title: 'Gathered skirt pattern input (millimetres)',
  description: 'Structural schema. Also validate using specSchema for hip clearance, elastic stretch, casing width and positive body length.',
}, null, 2) + '\n');
await writeFile('penelope-runtime.schema.json', JSON.stringify({ ...z.toJSONSchema(penelopeInputSchema, { io: 'input' }),
  title: 'Registered Penelope runtime input',
  description: 'Structural contract for the tested FreeSewing Penelope adapter. Cross-field validation and seam-length gates run in generatePenelope(). Other designs use the untested catalog runtime.',
}, null, 2) + '\n');

await writeFile('garment-intent.schema.json', JSON.stringify({ ...z.toJSONSchema(garmentIntentSchema),
  title: 'Photo garment intent',
  description: 'Neutral garment observations, user-provided measurements and preferences before catalog matching. analysisSource identifies Gemini output or test fixtures. No designId belongs in this object.',
}, null, 2) + '\n');
