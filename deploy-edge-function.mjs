import { readFileSync } from 'fs';
import { join } from 'path';

const functionsDir = './supabase/functions/search-formations';

const fileList = [
  'index.ts',
  'perplexity_enrich.ts',
  'refea.ts',
  'refea.json',
  'refeaRules.ts',
  'refeaSearch.ts',
  'trainingCatalog.ts',
  'trainingMatch.ts',
  'trainingWhitelist.ts'
];

const files = fileList.map(filename => ({
  name: filename,
  content: readFileSync(join(functionsDir, filename), 'utf-8')
}));

console.log(JSON.stringify({
  name: 'search-formations',
  slug: 'search-formations',
  verify_jwt: false,
  entrypoint_path: 'index.ts',
  files
}, null, 2));
