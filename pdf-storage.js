const fs = require('fs/promises');
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

function isStoredPdfName(name) {
  return /^[a-f0-9-]+\.pdf(?:\.gz)?$/i.test(String(name || ''));
}

async function optimizePdf(sourcePath) {
  const original = await fs.stat(sourcePath);
  const compressedPath = `${sourcePath}.gz`;

  try {
    await pipeline(
      createReadStream(sourcePath),
      zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
      createWriteStream(compressedPath, { mode: 0o600 }),
    );
    const compressed = await fs.stat(compressedPath);

    if (compressed.size >= original.size) {
      await fs.unlink(compressedPath);
      return {
        path: sourcePath,
        storedName: path.basename(sourcePath),
        originalSize: original.size,
        storedSize: original.size,
        encoding: null,
        savedBytes: 0,
      };
    }

    await fs.unlink(sourcePath);
    return {
      path: compressedPath,
      storedName: path.basename(compressedPath),
      originalSize: original.size,
      storedSize: compressed.size,
      encoding: 'gzip',
      savedBytes: original.size - compressed.size,
    };
  } catch (error) {
    await fs.unlink(compressedPath).catch(() => {});
    throw error;
  }
}

module.exports = { isStoredPdfName, optimizePdf };

