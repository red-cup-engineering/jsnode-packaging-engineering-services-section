// Validate a finite own-data JSON tree BEFORE serialization; never invoke toJSON/getters.
export function boundedClone(value, maximumBytes, maximumStringLength = 8192) {
  let size = 0, nodes = 0; const ancestors = new Set();
  function visit(item, depth) {
    if (++nodes > 65536 || depth > 8) throw new TypeError('bounded data tree required');
    if (typeof item === 'string') { if (item.length > maximumStringLength) throw new TypeError('bounded string required'); size += Buffer.byteLength(item) * 6 + 2; }
    else if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) size += 32;
    else if (item && typeof item === 'object') {
      if (ancestors.has(item)) throw new TypeError('cyclic data refused');
      const array = Array.isArray(item);
      if (!(array ? Object.getPrototypeOf(item) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(item)))) throw new TypeError('own-data JSON required');
      const keys = Reflect.ownKeys(item);
      if (keys.length > (array ? 4097 : 64)) throw new TypeError('bounded collection required');
      if (array && (item.length > 4096 || keys.length !== item.length + 1)) throw new TypeError('dense bounded array required');
      ancestors.add(item); size += 2;
      for (const key of keys) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string' || key.length > 256 || (array && !/^(0|[1-9][0-9]*)$/u.test(key))) throw new TypeError('bounded data key required');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor.enumerable || !('value' in descriptor)) throw new TypeError('own-data field required');
        size += Buffer.byteLength(key) * 6 + 4; visit(descriptor.value, depth + 1);
      }
      ancestors.delete(item);
    } else throw new TypeError('JSON data value required');
    if (size > maximumBytes) throw new TypeError('serialization budget exceeded');
  }
  visit(value, 0); return JSON.parse(JSON.stringify(value));
}

// Native JSON.parse supplies syntax semantics. This is only a bounded top-level
// package-key duplicate check, including equivalent escaped key spellings.
export function parseBatchMetadataOutput(text) {
  if (typeof text !== 'string' || text.length >= 1048576) throw new TypeError('bounded native batch JSON required');
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new TypeError('native batch JSON object required');
  const keys = new Set(); let depth = 0, keyExpected = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      const start = index++;
      while (index < text.length && text[index] !== '"') { if (text[index] === '\\') index++; index++; }
      if (depth === 1 && keyExpected) {
        const key = JSON.parse(text.slice(start, index + 1));
        if (keys.has(key)) throw new TypeError('duplicate native batch package key');
        keys.add(key); keyExpected = false;
      }
    } else if (char === '{' || char === '[') {
      if (++depth > 64) throw new TypeError('bounded native batch JSON depth required');
      if (depth === 1) keyExpected = true;
    } else if (char === '}' || char === ']') depth--;
    else if (char === ',' && depth === 1) keyExpected = true;
  }
  return parsed;
}
