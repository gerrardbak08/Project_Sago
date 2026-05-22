import rawAccidents from '../data/raw/accidents.json';
import rawStores    from '../data/raw/stores.json';
import { processAccidents } from './processAccidents.js';
import { processStores }    from './processStores.js';

function normalizeAccidentRow(r) {
  const yr = parseInt(r['년']);
  return {
    ...r,
    '년': yr < 100 ? yr + 2000 : yr,
  };
}

const accRows   = rawAccidents.data.map(normalizeAccidentRow);
const storeRows = rawStores.data;

const storesProcessed = processStores(storeRows);
const result          = processAccidents(accRows, storesProcessed, null);

export default result;
