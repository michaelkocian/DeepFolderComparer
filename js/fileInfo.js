/**
 * FileInfo — normalized file metadata object.
 * Now uses fullPath instead of file/directory handles (backend provides file access).
 */

/**
 * @typedef {Object} FileInfo
 * @property {string} name - Filename
 * @property {string} relativePath - Path relative to selected root (using / separator)
 * @property {string} fullPath - Absolute file path on disk
 * @property {string} parentPath - Parent directory relative path
 * @property {number} size - File size in bytes
 * @property {number} lastModified - Last modified timestamp (ms since epoch)
 * @property {number} createdAt - Creation timestamp (ms since epoch)
 * @property {string} type - MIME type
 * @property {string} extension - File extension (lowercase, without dot)
 * @property {number} depth - Nesting depth (0 = root level)
 * @property {boolean} isHidden - Starts with dot or is hidden
 */

/**
 * Create a FileInfo object from a backend DTO.
 * @param {object} dto - FileInfoDto from the backend API
 * @returns {FileInfo}
 */
export function createFileInfoFromDto(dto) {
  return {
    name: dto.name,
    relativePath: dto.relativePath,
    fullPath: dto.fullPath,
    parentPath: dto.parentPath,
    size: dto.size,
    lastModified: dto.lastModified,
    createdAt: dto.createdAt || dto.lastModified,
    type: dto.type || guessType(dto.name),
    extension: dto.extension,
    depth: dto.depth,
    isHidden: dto.isHidden,
  };
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[exponent]}`;
}

/**
 * Format timestamp for display.
 */
export function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Guess MIME type from extension when backend doesn't provide one.
 */
function guessType(filename) {
  const ext = (filename.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    pdf: 'application/pdf', zip: 'application/zip', rar: 'application/x-rar',
    '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
    js: 'text/javascript', ts: 'text/typescript', html: 'text/html', css: 'text/css',
    json: 'application/json', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown',
    py: 'text/x-python', java: 'text/x-java', c: 'text/x-c', cpp: 'text/x-c++',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Get the file category for icon selection.
 */
export function getFileCategory(fileInfo) {
  const { type, extension } = fileInfo;
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (['zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz'].includes(extension)) return 'archive';
  if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'go', 'rs', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh', 'bat', 'ps1', 'sql'].includes(extension)) return 'code';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'tex'].includes(extension)) return 'document';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'document';
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'document';
  return 'file';
}
