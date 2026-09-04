const { DateTime } = require('luxon');

const CITY_TIME_ZONE = 'Europe/Paris';

function computeDeleteAt(endDate) {
  const parsed = DateTime.fromISO(endDate, { zone: CITY_TIME_ZONE });
  if (!parsed.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Date de fin invalide');
  }

  return parsed.endOf('day').plus({ days: 2 }).toUTC().toISO();
}

function isExpired(record, now = DateTime.utc()) {
  if (!record.temporary || !record.deleteAt) return false;
  const deleteAt = DateTime.fromISO(record.deleteAt, { zone: 'utc' });
  return deleteAt.isValid && now.toMillis() >= deleteAt.toMillis();
}

module.exports = { CITY_TIME_ZONE, computeDeleteAt, isExpired };
