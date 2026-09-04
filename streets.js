const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');
const { Readable } = require('stream');
const zlib = require('zlib');
const { normalize } = require('./store');

const DEFAULT_BAN_URL = 'https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-71.csv.gz';
const CHALON_INSEE_CODE = '71076';

class StreetsRepository {
  constructor(dataDir, seedFile) {
    this.file = path.join(dataDir, 'voies-chalon-sur-saone.json');
    this.metaFile = path.join(dataDir, 'voies-meta.json');
    this.seedFile = seedFile;
    this.refreshing = null;
  }

  async initialize() {
    try {
      await fs.access(this.file);
    } catch {
      const seed = JSON.parse(await fs.readFile(this.seedFile, 'utf8'));
      await this.write(seed);
    }
  }

  async list() {
    const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  }

  async metadata() {
    try {
      return JSON.parse(await fs.readFile(this.metaFile, 'utf8'));
    } catch {
      return { source: 'liste locale de secours', updatedAt: null };
    }
  }

  async add(name) {
    const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
    if (cleaned.length < 3 || cleaned.length > 160) throw new Error('Nom de voie invalide');
    const streets = await this.list();
    if (!streets.some((street) => normalize(street) === normalize(cleaned))) streets.push(cleaned);
    await this.write(streets);
    return cleaned;
  }

  async write(streets) {
    const unique = [...new Map(streets.filter(Boolean).map((street) => [normalize(street), String(street).trim()])).values()]
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    await fs.writeFile(this.file, `${JSON.stringify(unique, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return unique;
  }

  refreshFromBan() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.performRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async performRefresh() {
    const url = process.env.BAN_CSV_URL || DEFAULT_BAN_URL;
    const response = await fetch(url, { headers: { 'user-agent': 'ARGOS-Arretes-Municipaux/1.0' } });
    if (!response.ok || !response.body) throw new Error(`Téléchargement BAN impossible (${response.status})`);

    const csvStream = Readable.fromWeb(response.body).pipe(zlib.createGunzip());
    const lines = readline.createInterface({ input: csvStream, crlfDelay: Infinity });
    const streets = new Set();
    let headers = null;

    for await (const line of lines) {
      const values = parseCsvLine(line, ';');
      if (!headers) {
        headers = values.map((value) => value.replace(/^\uFEFF/, ''));
        continue;
      }
      const codeIndex = headers.indexOf('code_insee');
      const streetIndex = headers.indexOf('nom_voie');
      if (codeIndex === -1 || streetIndex === -1) throw new Error('Format BAN inattendu');
      if (values[codeIndex] === CHALON_INSEE_CODE && values[streetIndex]) streets.add(values[streetIndex].trim());
    }

    if (streets.size < 100) throw new Error(`Liste BAN incomplète (${streets.size} voies)`);
    const saved = await this.write([...streets]);
    await fs.writeFile(
      this.metaFile,
      `${JSON.stringify({ source: 'Base Adresse Nationale', inseeCode: CHALON_INSEE_CODE, updatedAt: new Date().toISOString(), count: saved.length }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    return saved;
  }
}

function parseCsvLine(line, delimiter) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  fields.push(value);
  return fields;
}

module.exports = { CHALON_INSEE_CODE, StreetsRepository, parseCsvLine };
