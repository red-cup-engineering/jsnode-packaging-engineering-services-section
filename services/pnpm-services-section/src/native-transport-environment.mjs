import { sha256Hex, semanticHex } from "@red-cup-engineering/semiotic-content-address-system";
import { deepFreeze } from "@red-cup-engineering/signcell/values";
// Original metadata transport grammar, shared without importing its effectful composition.

const own = (value, allowed, required = allowed) => {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('own data record required');
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !d.enumerable || !('value' in d)) throw new TypeError('unsupported data field');
  }
  if (required.some(key => !Object.hasOwn(value, key))) throw new TypeError('required data field absent');
};

const environmentKeys = new Set(['PATH','HOME','XDG_CONFIG_HOME','NODE_USE_ENV_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE',
  'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NO_PROXY','no_proxy',
  'NPM_CONFIG_PROXY','NPM_CONFIG_HTTP_PROXY','NPM_CONFIG_HTTPS_PROXY','NPM_CONFIG_NOPROXY',
  'npm_config_proxy','npm_config_http_proxy','npm_config_https_proxy','npm_config_noproxy',
  'NPM_CONFIG_PREFIX','NPM_CONFIG_AUDIT','NPM_CONFIG_FUND']);
const relay = key => key !== 'NODE_USE_ENV_PROXY' && /proxy$/iu.test(key) && !/no_?proxy$/iu.test(key);
export function receiveNativeTransportEnvironment(input, policy) {
  own(input, [...environmentKeys], ['PATH','HOME']);
  own(policy, ['stable','relays']);
  own(policy.stable, [...environmentKeys], []); own(policy.relays, [...environmentKeys].filter(relay), []);
  const result = {}, stable = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length > 8192 || /[\0\r\n]/u.test(value)) throw new TypeError('bounded environment value required');
    if (relay(key)) {
      const expected = policy.relays[key]; own(expected, ['protocol','hostnameSHA256']);
      if (!['http:','https:','socks5:','socks5h:'].includes(expected.protocol) || !/^[a-f0-9]{64}$/u.test(expected.hostnameSHA256)) throw new TypeError('fixed relay role required');
      let url; try { url = new URL(value); } catch { throw new TypeError('malformed relay URL'); }
      if (url.protocol !== expected.protocol || sha256Hex(url.hostname) !== expected.hostnameSHA256 || url.username || url.password || url.search || url.hash
        || !['','/'].includes(url.pathname) || !url.port || Number(url.port) < 1) throw new TypeError('relay role changed or credential bearing');
    } else {
      if (typeof policy.stable[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(policy.stable[key]) || sha256Hex(value) !== policy.stable[key]) throw new TypeError('stable environment changed');
      stable[key] = sha256Hex(value);
    }
    result[key] = value;
  }
  if (Object.keys(policy.stable).some(key => !Object.hasOwn(result,key)) || Object.keys(policy.relays).some(key => !Object.hasOwn(result,key))) throw new TypeError('environment input absent');
  return { values: deepFreeze(result), identity: { keys: Object.keys(result).sort(), stable, sha256: semanticHex(result) } };
}
