const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { DateTime } = require('luxon');
const { isExpired } = require('./expiry');
const { isStoredPdfName } = require('./pdf-storage');

class ArretesStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.recordsFile = path.join(dataDir, 'arretes.json');
    this.uploadsDir = path.join(dataDir, 'pieces-jointes');
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    try {
      await fs.access(this.recordsFile);
    } catch {
      await this.writeRecords([]);
    }
  }

  async readRecords() {
    const raw = await fs.readFile(this.recordsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Le fichier des arrêtés est invalide');
    return parsed;
  }

  async writeRecords(records) {
    const temporary = `${this.recordsFile}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, this.recordsFile);
  }

  serialized(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async list(filters = {}) {
    const records = await this.readRecords();
    const query = normalize(filters.q);
    const street = normalize(filters.street);
    const from = filters.from ? DateTime.fromISO(filters.from) : null;
    const to = filters.to ? DateTime.fromISO(filters.to) : null;
    const status = filters.status || 'all';

    return records
      .filter((record) => {
        if (status === 'temporary' && !record.temporary) return false;
        if (status === 'permanent' && record.temporary) return false;
        if (street && !record.streets.some((name) => normalize(name) === street)) return false;
        const date = DateTime.fromISO(record.date);
        if (from?.isValid && date < from.startOf('day')) return false;
        if (to?.isValid && date > to.endOf('day')) return false;
        if (!query) return true;
        const haystack = normalize([
          record.number,
          record.name,
          record.locationDetails,
          record.streets.join(' '),
          record.createdBy?.name,
        ].join(' '));
        return haystack.includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id) {
    const records = await this.readRecords();
    return records.find((record) => record.id === id) || null;
  }

  async create(input) {
    return this.serialized(async () => {
      const records = await this.readRecords();
      if (records.some((record) => normalize(record.number) === normalize(input.number))) {
        const error = new Error('Ce numéro d’arrêté existe déjà');
        error.status = 409;
        throw error;
      }
      const record = {
        id: crypto.randomUUID(),
        number: input.number,
        name: input.name,
        date: input.date,
        streets: input.streets,
        locationDetails: input.locationDetails,
        temporary: input.temporary,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        deleteAt: input.deleteAt || null,
        attachment: input.attachment,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      };
      records.push(record);
      await this.writeRecords(records);
      return record;
    });
  }

  async deleteById(id) {
    return this.serialized(async () => {
      const records = await this.readRecords();
      const record = records.find((item) => item.id === id);
      if (!record) return false;
      await this.writeRecords(records.filter((item) => item.id !== id));
      await this.deleteAttachment(record.attachment?.storedName);
      return true;
    });
  }

  async purgeExpired(now = DateTime.utc()) {
    return this.serialized(async () => {
      const records = await this.readRecords();
      const expired = records.filter((record) => isExpired(record, now));
      if (!expired.length) return [];
      await this.writeRecords(records.filter((record) => !isExpired(record, now)));
      await Promise.all(expired.map((record) => this.deleteAttachment(record.attachment?.storedName)));
      return expired.map((record) => ({ id: record.id, number: record.number }));
    });
  }

  async deleteAttachment(storedName) {
    if (!isStoredPdfName(storedName)) return;
    try {
      await fs.unlink(path.join(this.uploadsDir, storedName));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim();
}

module.exports = { ArretesStore, normalize };
