// node_modules/.pnpm/@netlify+blobs@8.1.0/node_modules/@netlify/blobs/dist/chunk-GUEW34CP.js
var NF_ERROR = "x-nf-error";
var NF_REQUEST_ID = "x-nf-request-id";
var BlobsInternalError = class extends Error {
  constructor(res) {
    let details = res.headers.get(NF_ERROR) || `${res.status} status code`;
    if (res.headers.has(NF_REQUEST_ID)) {
      details += `, ID: ${res.headers.get(NF_REQUEST_ID)}`;
    }
    super(`Netlify Blobs has generated an internal error (${details})`);
    this.name = "BlobsInternalError";
  }
};
var collectIterator = async (iterator) => {
  const result = [];
  for await (const item of iterator) {
    result.push(item);
  }
  return result;
};
var base64Decode = (input) => {
  const { Buffer } = globalThis;
  if (Buffer) {
    return Buffer.from(input, "base64").toString();
  }
  return atob(input);
};
var base64Encode = (input) => {
  const { Buffer } = globalThis;
  if (Buffer) {
    return Buffer.from(input).toString("base64");
  }
  return btoa(input);
};
var getEnvironment = () => {
  const { Deno, Netlify: Netlify2, process: process2 } = globalThis;
  return Netlify2?.env ?? Deno?.env ?? {
    delete: (key) => delete process2?.env[key],
    get: (key) => process2?.env[key],
    has: (key) => Boolean(process2?.env[key]),
    set: (key, value) => {
      if (process2?.env) {
        process2.env[key] = value;
      }
    },
    toObject: () => process2?.env ?? {}
  };
};
var getEnvironmentContext = () => {
  const context = globalThis.netlifyBlobsContext || getEnvironment().get("NETLIFY_BLOBS_CONTEXT");
  if (typeof context !== "string" || !context) {
    return {};
  }
  const data = base64Decode(context);
  try {
    return JSON.parse(data);
  } catch {
  }
  return {};
};
var MissingBlobsEnvironmentError = class extends Error {
  constructor(requiredProperties) {
    super(
      `The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: ${requiredProperties.join(
        ", "
      )}`
    );
    this.name = "MissingBlobsEnvironmentError";
  }
};
var BASE64_PREFIX = "b64;";
var METADATA_HEADER_INTERNAL = "x-amz-meta-user";
var METADATA_HEADER_EXTERNAL = "netlify-blobs-metadata";
var METADATA_MAX_SIZE = 2 * 1024;
var encodeMetadata = (metadata) => {
  if (!metadata) {
    return null;
  }
  const encodedObject = base64Encode(JSON.stringify(metadata));
  const payload = `b64;${encodedObject}`;
  if (METADATA_HEADER_EXTERNAL.length + payload.length > METADATA_MAX_SIZE) {
    throw new Error("Metadata object exceeds the maximum size");
  }
  return payload;
};
var decodeMetadata = (header) => {
  if (!header || !header.startsWith(BASE64_PREFIX)) {
    return {};
  }
  const encodedData = header.slice(BASE64_PREFIX.length);
  const decodedData = base64Decode(encodedData);
  const metadata = JSON.parse(decodedData);
  return metadata;
};
var getMetadataFromResponse = (response) => {
  if (!response.headers) {
    return {};
  }
  const value = response.headers.get(METADATA_HEADER_EXTERNAL) || response.headers.get(METADATA_HEADER_INTERNAL);
  try {
    return decodeMetadata(value);
  } catch {
    throw new Error(
      "An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client."
    );
  }
};
var BlobsConsistencyError = class extends Error {
  constructor() {
    super(
      `Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property`
    );
    this.name = "BlobsConsistencyError";
  }
};
var regions = {
  "us-east-1": true,
  "us-east-2": true
};
var isValidRegion = (input) => Object.keys(regions).includes(input);
var InvalidBlobsRegionError = class extends Error {
  constructor(region) {
    super(
      `${region} is not a supported Netlify Blobs region. Supported values are: ${Object.keys(regions).join(", ")}.`
    );
    this.name = "InvalidBlobsRegionError";
  }
};
var DEFAULT_RETRY_DELAY = getEnvironment().get("NODE_ENV") === "test" ? 1 : 5e3;
var MIN_RETRY_DELAY = 1e3;
var MAX_RETRY = 5;
var RATE_LIMIT_HEADER = "X-RateLimit-Reset";
var fetchAndRetry = async (fetch, url, options, attemptsLeft = MAX_RETRY) => {
  try {
    const res = await fetch(url, options);
    if (attemptsLeft > 0 && (res.status === 429 || res.status >= 500)) {
      const delay = getDelay(res.headers.get(RATE_LIMIT_HEADER));
      await sleep(delay);
      return fetchAndRetry(fetch, url, options, attemptsLeft - 1);
    }
    return res;
  } catch (error) {
    if (attemptsLeft === 0) {
      throw error;
    }
    const delay = getDelay();
    await sleep(delay);
    return fetchAndRetry(fetch, url, options, attemptsLeft - 1);
  }
};
var getDelay = (rateLimitReset) => {
  if (!rateLimitReset) {
    return DEFAULT_RETRY_DELAY;
  }
  return Math.max(Number(rateLimitReset) * 1e3 - Date.now(), MIN_RETRY_DELAY);
};
var sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
var SIGNED_URL_ACCEPT_HEADER = "application/json;type=signed-url";
var Client = class {
  constructor({ apiURL, consistency, edgeURL, fetch, region, siteID, token, uncachedEdgeURL }) {
    this.apiURL = apiURL;
    this.consistency = consistency ?? "eventual";
    this.edgeURL = edgeURL;
    this.fetch = fetch ?? globalThis.fetch;
    this.region = region;
    this.siteID = siteID;
    this.token = token;
    this.uncachedEdgeURL = uncachedEdgeURL;
    if (!this.fetch) {
      throw new Error(
        "Netlify Blobs could not find a `fetch` client in the global scope. You can either update your runtime to a version that includes `fetch` (like Node.js 18.0.0 or above), or you can supply your own implementation using the `fetch` property."
      );
    }
  }
  async getFinalRequest({
    consistency: opConsistency,
    key,
    metadata,
    method,
    parameters = {},
    storeName
  }) {
    const encodedMetadata = encodeMetadata(metadata);
    const consistency = opConsistency ?? this.consistency;
    let urlPath = `/${this.siteID}`;
    if (storeName) {
      urlPath += `/${storeName}`;
    }
    if (key) {
      urlPath += `/${key}`;
    }
    if (this.edgeURL) {
      if (consistency === "strong" && !this.uncachedEdgeURL) {
        throw new BlobsConsistencyError();
      }
      const headers = {
        authorization: `Bearer ${this.token}`
      };
      if (encodedMetadata) {
        headers[METADATA_HEADER_INTERNAL] = encodedMetadata;
      }
      if (this.region) {
        urlPath = `/region:${this.region}${urlPath}`;
      }
      const url2 = new URL(urlPath, consistency === "strong" ? this.uncachedEdgeURL : this.edgeURL);
      for (const key2 in parameters) {
        url2.searchParams.set(key2, parameters[key2]);
      }
      return {
        headers,
        url: url2.toString()
      };
    }
    const apiHeaders = { authorization: `Bearer ${this.token}` };
    const url = new URL(`/api/v1/blobs${urlPath}`, this.apiURL ?? "https://api.netlify.com");
    for (const key2 in parameters) {
      url.searchParams.set(key2, parameters[key2]);
    }
    if (this.region) {
      url.searchParams.set("region", this.region);
    }
    if (storeName === void 0 || key === void 0) {
      return {
        headers: apiHeaders,
        url: url.toString()
      };
    }
    if (encodedMetadata) {
      apiHeaders[METADATA_HEADER_EXTERNAL] = encodedMetadata;
    }
    if (method === "head" || method === "delete") {
      return {
        headers: apiHeaders,
        url: url.toString()
      };
    }
    const res = await this.fetch(url.toString(), {
      headers: { ...apiHeaders, accept: SIGNED_URL_ACCEPT_HEADER },
      method
    });
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
    const { url: signedURL } = await res.json();
    const userHeaders = encodedMetadata ? { [METADATA_HEADER_INTERNAL]: encodedMetadata } : void 0;
    return {
      headers: userHeaders,
      url: signedURL
    };
  }
  async makeRequest({
    body,
    consistency,
    headers: extraHeaders,
    key,
    metadata,
    method,
    parameters,
    storeName
  }) {
    const { headers: baseHeaders = {}, url } = await this.getFinalRequest({
      consistency,
      key,
      metadata,
      method,
      parameters,
      storeName
    });
    const headers = {
      ...baseHeaders,
      ...extraHeaders
    };
    if (method === "put") {
      headers["cache-control"] = "max-age=0, stale-while-revalidate=60";
    }
    const options = {
      body,
      headers,
      method
    };
    if (body instanceof ReadableStream) {
      options.duplex = "half";
    }
    return fetchAndRetry(this.fetch, url, options);
  }
};
var getClientOptions = (options, contextOverride) => {
  const context = contextOverride ?? getEnvironmentContext();
  const siteID = context.siteID ?? options.siteID;
  const token = context.token ?? options.token;
  if (!siteID || !token) {
    throw new MissingBlobsEnvironmentError(["siteID", "token"]);
  }
  if (options.region !== void 0 && !isValidRegion(options.region)) {
    throw new InvalidBlobsRegionError(options.region);
  }
  const clientOptions = {
    apiURL: context.apiURL ?? options.apiURL,
    consistency: options.consistency,
    edgeURL: context.edgeURL ?? options.edgeURL,
    fetch: options.fetch,
    region: options.region,
    siteID,
    token,
    uncachedEdgeURL: context.uncachedEdgeURL ?? options.uncachedEdgeURL
  };
  return clientOptions;
};

// node_modules/.pnpm/@netlify+blobs@8.1.0/node_modules/@netlify/blobs/dist/main.js
var DEPLOY_STORE_PREFIX = "deploy:";
var LEGACY_STORE_INTERNAL_PREFIX = "netlify-internal/legacy-namespace/";
var SITE_STORE_PREFIX = "site:";
var Store = class _Store {
  constructor(options) {
    this.client = options.client;
    if ("deployID" in options) {
      _Store.validateDeployID(options.deployID);
      let name = DEPLOY_STORE_PREFIX + options.deployID;
      if (options.name) {
        name += `:${options.name}`;
      }
      this.name = name;
    } else if (options.name.startsWith(LEGACY_STORE_INTERNAL_PREFIX)) {
      const storeName = options.name.slice(LEGACY_STORE_INTERNAL_PREFIX.length);
      _Store.validateStoreName(storeName);
      this.name = storeName;
    } else {
      _Store.validateStoreName(options.name);
      this.name = SITE_STORE_PREFIX + options.name;
    }
  }
  async delete(key) {
    const res = await this.client.makeRequest({ key, method: "delete", storeName: this.name });
    if (![200, 204, 404].includes(res.status)) {
      throw new BlobsInternalError(res);
    }
  }
  async get(key, options) {
    const { consistency, type } = options ?? {};
    const res = await this.client.makeRequest({ consistency, key, method: "get", storeName: this.name });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
    if (type === void 0 || type === "text") {
      return res.text();
    }
    if (type === "arrayBuffer") {
      return res.arrayBuffer();
    }
    if (type === "blob") {
      return res.blob();
    }
    if (type === "json") {
      return res.json();
    }
    if (type === "stream") {
      return res.body;
    }
    throw new BlobsInternalError(res);
  }
  async getMetadata(key, { consistency } = {}) {
    const res = await this.client.makeRequest({ consistency, key, method: "head", storeName: this.name });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res);
    }
    const etag = res?.headers.get("etag") ?? void 0;
    const metadata = getMetadataFromResponse(res);
    const result = {
      etag,
      metadata
    };
    return result;
  }
  async getWithMetadata(key, options) {
    const { consistency, etag: requestETag, type } = options ?? {};
    const headers = requestETag ? { "if-none-match": requestETag } : void 0;
    const res = await this.client.makeRequest({
      consistency,
      headers,
      key,
      method: "get",
      storeName: this.name
    });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200 && res.status !== 304) {
      throw new BlobsInternalError(res);
    }
    const responseETag = res?.headers.get("etag") ?? void 0;
    const metadata = getMetadataFromResponse(res);
    const result = {
      etag: responseETag,
      metadata
    };
    if (res.status === 304 && requestETag) {
      return { data: null, ...result };
    }
    if (type === void 0 || type === "text") {
      return { data: await res.text(), ...result };
    }
    if (type === "arrayBuffer") {
      return { data: await res.arrayBuffer(), ...result };
    }
    if (type === "blob") {
      return { data: await res.blob(), ...result };
    }
    if (type === "json") {
      return { data: await res.json(), ...result };
    }
    if (type === "stream") {
      return { data: res.body, ...result };
    }
    throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`);
  }
  list(options = {}) {
    const iterator = this.getListIterator(options);
    if (options.paginate) {
      return iterator;
    }
    return collectIterator(iterator).then(
      (items) => items.reduce(
        (acc, item) => ({
          blobs: [...acc.blobs, ...item.blobs],
          directories: [...acc.directories, ...item.directories]
        }),
        { blobs: [], directories: [] }
      )
    );
  }
  async set(key, data, { metadata } = {}) {
    _Store.validateKey(key);
    const res = await this.client.makeRequest({
      body: data,
      key,
      metadata,
      method: "put",
      storeName: this.name
    });
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
  }
  async setJSON(key, data, { metadata } = {}) {
    _Store.validateKey(key);
    const payload = JSON.stringify(data);
    const headers = {
      "content-type": "application/json"
    };
    const res = await this.client.makeRequest({
      body: payload,
      headers,
      key,
      metadata,
      method: "put",
      storeName: this.name
    });
    if (res.status !== 200) {
      throw new BlobsInternalError(res);
    }
  }
  static formatListResultBlob(result) {
    if (!result.key) {
      return null;
    }
    return {
      etag: result.etag,
      key: result.key
    };
  }
  static validateKey(key) {
    if (key === "") {
      throw new Error("Blob key must not be empty.");
    }
    if (key.startsWith("/") || key.startsWith("%2F")) {
      throw new Error("Blob key must not start with forward slash (/).");
    }
    if (new TextEncoder().encode(key).length > 600) {
      throw new Error(
        "Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long."
      );
    }
  }
  static validateDeployID(deployID) {
    if (!/^\w{1,24}$/.test(deployID)) {
      throw new Error(`'${deployID}' is not a valid Netlify deploy ID.`);
    }
  }
  static validateStoreName(name) {
    if (name.includes("/") || name.includes("%2F")) {
      throw new Error("Store name must not contain forward slashes (/).");
    }
    if (new TextEncoder().encode(name).length > 64) {
      throw new Error(
        "Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long."
      );
    }
  }
  getListIterator(options) {
    const { client, name: storeName } = this;
    const parameters = {};
    if (options?.prefix) {
      parameters.prefix = options.prefix;
    }
    if (options?.directories) {
      parameters.directories = "true";
    }
    return {
      [Symbol.asyncIterator]() {
        let currentCursor = null;
        let done = false;
        return {
          async next() {
            if (done) {
              return { done: true, value: void 0 };
            }
            const nextParameters = { ...parameters };
            if (currentCursor !== null) {
              nextParameters.cursor = currentCursor;
            }
            const res = await client.makeRequest({
              method: "get",
              parameters: nextParameters,
              storeName
            });
            let blobs = [];
            let directories = [];
            if (![200, 204, 404].includes(res.status)) {
              throw new BlobsInternalError(res);
            }
            if (res.status === 404) {
              done = true;
            } else {
              const page = await res.json();
              if (page.next_cursor) {
                currentCursor = page.next_cursor;
              } else {
                done = true;
              }
              blobs = (page.blobs ?? []).map(_Store.formatListResultBlob).filter(Boolean);
              directories = page.directories ?? [];
            }
            return {
              done: false,
              value: {
                blobs,
                directories
              }
            };
          }
        };
      }
    };
  }
};
var getStore = (input) => {
  if (typeof input === "string") {
    const clientOptions = getClientOptions({});
    const client = new Client(clientOptions);
    return new Store({ client, name: input });
  }
  if (typeof input?.name === "string") {
    const { name } = input;
    const clientOptions = getClientOptions(input);
    if (!name) {
      throw new MissingBlobsEnvironmentError(["name"]);
    }
    const client = new Client(clientOptions);
    return new Store({ client, name });
  }
  if (typeof input?.deployID === "string") {
    const clientOptions = getClientOptions(input);
    const { deployID } = input;
    if (!deployID) {
      throw new MissingBlobsEnvironmentError(["deployID"]);
    }
    const client = new Client(clientOptions);
    return new Store({ client, deployID });
  }
  throw new Error(
    "The `getStore` method requires the name of the store as a string or as the `name` property of an options object"
  );
};

// src/ua-parser-js/main/ua-parser.mjs
var LIBVERSION = "2.0.3";
var UA_MAX_LENGTH = 500;
var USER_AGENT = "user-agent";
var EMPTY = "";
var UNKNOWN = "?";
var FUNC_TYPE = "function";
var UNDEF_TYPE = "undefined";
var OBJ_TYPE = "object";
var STR_TYPE = "string";
var UA_BROWSER = "browser";
var UA_CPU = "cpu";
var UA_DEVICE = "device";
var UA_ENGINE = "engine";
var UA_OS = "os";
var UA_RESULT = "result";
var NAME = "name";
var TYPE = "type";
var VENDOR = "vendor";
var VERSION = "version";
var ARCHITECTURE = "architecture";
var MAJOR = "major";
var MODEL = "model";
var CONSOLE = "console";
var MOBILE = "mobile";
var TABLET = "tablet";
var SMARTTV = "smarttv";
var WEARABLE = "wearable";
var XR = "xr";
var EMBEDDED = "embedded";
var INAPP = "inapp";
var BRANDS = "brands";
var FORMFACTORS = "formFactors";
var FULLVERLIST = "fullVersionList";
var PLATFORM = "platform";
var PLATFORMVER = "platformVersion";
var BITNESS = "bitness";
var CH_HEADER = "sec-ch-ua";
var CH_HEADER_FULL_VER_LIST = CH_HEADER + "-full-version-list";
var CH_HEADER_ARCH = CH_HEADER + "-arch";
var CH_HEADER_BITNESS = CH_HEADER + "-" + BITNESS;
var CH_HEADER_FORM_FACTORS = CH_HEADER + "-form-factors";
var CH_HEADER_MOBILE = CH_HEADER + "-" + MOBILE;
var CH_HEADER_MODEL = CH_HEADER + "-" + MODEL;
var CH_HEADER_PLATFORM = CH_HEADER + "-" + PLATFORM;
var CH_HEADER_PLATFORM_VER = CH_HEADER_PLATFORM + "-version";
var CH_ALL_VALUES = [BRANDS, FULLVERLIST, MOBILE, MODEL, PLATFORM, PLATFORMVER, ARCHITECTURE, FORMFACTORS, BITNESS];
var AMAZON = "Amazon";
var APPLE = "Apple";
var ASUS = "ASUS";
var BLACKBERRY = "BlackBerry";
var GOOGLE = "Google";
var HUAWEI = "Huawei";
var LENOVO = "Lenovo";
var HONOR = "Honor";
var LG = "LG";
var MICROSOFT = "Microsoft";
var MOTOROLA = "Motorola";
var NVIDIA = "Nvidia";
var ONEPLUS = "OnePlus";
var OPPO = "OPPO";
var SAMSUNG = "Samsung";
var SHARP = "Sharp";
var SONY = "Sony";
var XIAOMI = "Xiaomi";
var ZEBRA = "Zebra";
var CHROME = "Chrome";
var CHROMIUM = "Chromium";
var CHROMECAST = "Chromecast";
var EDGE = "Edge";
var FIREFOX = "Firefox";
var OPERA = "Opera";
var FACEBOOK = "Facebook";
var SOGOU = "Sogou";
var PREFIX_MOBILE = "Mobile ";
var SUFFIX_BROWSER = " Browser";
var WINDOWS = "Windows";
var isWindow = typeof window !== UNDEF_TYPE;
var NAVIGATOR = isWindow && window.navigator ? window.navigator : void 0;
var NAVIGATOR_UADATA = NAVIGATOR && NAVIGATOR.userAgentData ? NAVIGATOR.userAgentData : void 0;
var extend = function(defaultRgx, extensions) {
  var mergedRgx = {};
  var extraRgx = extensions;
  if (!isExtensions(extensions)) {
    extraRgx = {};
    for (var i in extensions) {
      for (var j in extensions[i]) {
        extraRgx[j] = extensions[i][j].concat(extraRgx[j] ? extraRgx[j] : []);
      }
    }
  }
  for (var k in defaultRgx) {
    mergedRgx[k] = extraRgx[k] && extraRgx[k].length % 2 === 0 ? extraRgx[k].concat(defaultRgx[k]) : defaultRgx[k];
  }
  return mergedRgx;
};
var enumerize = function(arr) {
  var enums = {};
  for (var i = 0; i < arr.length; i++) {
    enums[arr[i].toUpperCase()] = arr[i];
  }
  return enums;
};
var has = function(str1, str2) {
  if (typeof str1 === OBJ_TYPE && str1.length > 0) {
    for (var i in str1) {
      if (lowerize(str1[i]) == lowerize(str2)) return true;
    }
    return false;
  }
  return isString(str1) ? lowerize(str2).indexOf(lowerize(str1)) !== -1 : false;
};
var isExtensions = function(obj, deep) {
  for (var prop in obj) {
    return /^(browser|cpu|device|engine|os)$/.test(prop) || (deep ? isExtensions(obj[prop]) : false);
  }
};
var isString = function(val) {
  return typeof val === STR_TYPE;
};
var itemListToArray = function(header) {
  if (!header) return void 0;
  var arr = [];
  var tokens = strip(/\\?\"/g, header).split(",");
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].indexOf(";") > -1) {
      var token = trim(tokens[i]).split(";v=");
      arr[i] = { brand: token[0], version: token[1] };
    } else {
      arr[i] = trim(tokens[i]);
    }
  }
  return arr;
};
var lowerize = function(str) {
  return isString(str) ? str.toLowerCase() : str;
};
var majorize = function(version) {
  return isString(version) ? strip(/[^\d\.]/g, version).split(".")[0] : void 0;
};
var setProps = function(arr) {
  for (var i in arr) {
    var propName = arr[i];
    if (typeof propName == OBJ_TYPE && propName.length == 2) {
      this[propName[0]] = propName[1];
    } else {
      this[propName] = void 0;
    }
  }
  return this;
};
var strip = function(pattern, str) {
  return isString(str) ? str.replace(pattern, EMPTY) : str;
};
var stripQuotes = function(str) {
  return strip(/\\?\"/g, str);
};
var trim = function(str, len) {
  if (isString(str)) {
    str = strip(/^\s\s*/, str);
    return typeof len === UNDEF_TYPE ? str : str.substring(0, UA_MAX_LENGTH);
  }
};
var rgxMapper = function(ua, arrays) {
  if (!ua || !arrays) return;
  var i = 0, j, k, p, q, matches, match;
  while (i < arrays.length && !matches) {
    var regex = arrays[i], props = arrays[i + 1];
    j = k = 0;
    while (j < regex.length && !matches) {
      if (!regex[j]) {
        break;
      }
      matches = regex[j++].exec(ua);
      if (!!matches) {
        for (p = 0; p < props.length; p++) {
          match = matches[++k];
          q = props[p];
          if (typeof q === OBJ_TYPE && q.length > 0) {
            if (q.length === 2) {
              if (typeof q[1] == FUNC_TYPE) {
                this[q[0]] = q[1].call(this, match);
              } else {
                this[q[0]] = q[1];
              }
            } else if (q.length === 3) {
              if (typeof q[1] === FUNC_TYPE && !(q[1].exec && q[1].test)) {
                this[q[0]] = match ? q[1].call(this, match, q[2]) : void 0;
              } else {
                this[q[0]] = match ? match.replace(q[1], q[2]) : void 0;
              }
            } else if (q.length === 4) {
              this[q[0]] = match ? q[3].call(this, match.replace(q[1], q[2])) : void 0;
            }
          } else {
            this[q] = match ? match : void 0;
          }
        }
      }
    }
    i += 2;
  }
};
var strMapper = function(str, map) {
  for (var i in map) {
    if (typeof map[i] === OBJ_TYPE && map[i].length > 0) {
      for (var j = 0; j < map[i].length; j++) {
        if (has(map[i][j], str)) {
          return i === UNKNOWN ? void 0 : i;
        }
      }
    } else if (has(map[i], str)) {
      return i === UNKNOWN ? void 0 : i;
    }
  }
  return map.hasOwnProperty("*") ? map["*"] : str;
};
var windowsVersionMap = {
  "ME": "4.90",
  "NT 3.11": "NT3.51",
  "NT 4.0": "NT4.0",
  "2000": "NT 5.0",
  "XP": ["NT 5.1", "NT 5.2"],
  "Vista": "NT 6.0",
  "7": "NT 6.1",
  "8": "NT 6.2",
  "8.1": "NT 6.3",
  "10": ["NT 6.4", "NT 10.0"],
  "RT": "ARM"
};
var formFactorsMap = {
  "embedded": "Automotive",
  "mobile": "Mobile",
  "tablet": ["Tablet", "EInk"],
  "smarttv": "TV",
  "wearable": "Watch",
  "xr": ["VR", "XR"],
  "?": ["Desktop", "Unknown"],
  "*": void 0
};
var defaultRegexes = {
  browser: [
    [
      // Most common regardless engine
      /\b(?:crmo|crios)\/([\w\.]+)/i
      // Chrome for Android/iOS
    ],
    [VERSION, [NAME, PREFIX_MOBILE + "Chrome"]],
    [
      /edg(?:e|ios|a)?\/([\w\.]+)/i
      // Microsoft Edge
    ],
    [VERSION, [NAME, "Edge"]],
    [
      // Presto based
      /(opera mini)\/([-\w\.]+)/i,
      // Opera Mini
      /(opera [mobiletab]{3,6})\b.+version\/([-\w\.]+)/i,
      // Opera Mobi/Tablet
      /(opera)(?:.+version\/|[\/ ]+)([\w\.]+)/i
      // Opera
    ],
    [NAME, VERSION],
    [
      /opios[\/ ]+([\w\.]+)/i
      // Opera mini on iphone >= 8.0
    ],
    [VERSION, [NAME, OPERA + " Mini"]],
    [
      /\bop(?:rg)?x\/([\w\.]+)/i
      // Opera GX
    ],
    [VERSION, [NAME, OPERA + " GX"]],
    [
      /\bopr\/([\w\.]+)/i
      // Opera Webkit
    ],
    [VERSION, [NAME, OPERA]],
    [
      // Mixed
      /\bb[ai]*d(?:uhd|[ub]*[aekoprswx]{5,6})[\/ ]?([\w\.]+)/i
      // Baidu
    ],
    [VERSION, [NAME, "Baidu"]],
    [
      /\b(?:mxbrowser|mxios|myie2)\/?([-\w\.]*)\b/i
      // Maxthon
    ],
    [VERSION, [NAME, "Maxthon"]],
    [
      /(kindle)\/([\w\.]+)/i,
      // Kindle
      /(lunascape|maxthon|netfront|jasmine|blazer|sleipnir)[\/ ]?([\w\.]*)/i,
      // Lunascape/Maxthon/Netfront/Jasmine/Blazer/Sleipnir
      // Trident based
      /(avant|iemobile|slim(?:browser|boat|jet))[\/ ]?([\d\.]*)/i,
      // Avant/IEMobile/SlimBrowser/SlimBoat/Slimjet
      /(?:ms|\()(ie) ([\w\.]+)/i,
      // Internet Explorer
      // Blink/Webkit/KHTML based                                         // Flock/RockMelt/Midori/Epiphany/Silk/Skyfire/Bolt/Iron/Iridium/PhantomJS/Bowser/QupZilla/Falkon/LG Browser/Otter/qutebrowser/Dooble
      /(flock|rockmelt|midori|epiphany|silk|skyfire|ovibrowser|bolt|iron|vivaldi|iridium|phantomjs|bowser|qupzilla|falkon|rekonq|puffin|brave|whale(?!.+naver)|qqbrowserlite|duckduckgo|klar|helio|(?=comodo_)?dragon|otter|dooble|(?:lg |qute)browser)\/([-\w\.]+)/i,
      // Rekonq/Puffin/Brave/Whale/QQBrowserLite/QQ//Vivaldi/DuckDuckGo/Klar/Helio/Dragon
      /(heytap|ovi|115|surf)browser\/([\d\.]+)/i,
      // HeyTap/Ovi/115/Surf
      /(ecosia|weibo)(?:__| \w+@)([\d\.]+)/i
      // Ecosia/Weibo
    ],
    [NAME, VERSION],
    [
      /quark(?:pc)?\/([-\w\.]+)/i
      // Quark
    ],
    [VERSION, [NAME, "Quark"]],
    [
      /\bddg\/([\w\.]+)/i
      // DuckDuckGo
    ],
    [VERSION, [NAME, "DuckDuckGo"]],
    [
      /(?:\buc? ?browser|(?:juc.+)ucweb)[\/ ]?([\w\.]+)/i
      // UCBrowser
    ],
    [VERSION, [NAME, "UCBrowser"]],
    [
      /microm.+\bqbcore\/([\w\.]+)/i,
      // WeChat Desktop for Windows Built-in Browser
      /\bqbcore\/([\w\.]+).+microm/i,
      /micromessenger\/([\w\.]+)/i
      // WeChat
    ],
    [VERSION, [NAME, "WeChat"]],
    [
      /konqueror\/([\w\.]+)/i
      // Konqueror
    ],
    [VERSION, [NAME, "Konqueror"]],
    [
      /trident.+rv[: ]([\w\.]{1,9})\b.+like gecko/i
      // IE11
    ],
    [VERSION, [NAME, "IE"]],
    [
      /ya(?:search)?browser\/([\w\.]+)/i
      // Yandex
    ],
    [VERSION, [NAME, "Yandex"]],
    [
      /slbrowser\/([\w\.]+)/i
      // Smart Lenovo Browser
    ],
    [VERSION, [NAME, "Smart " + LENOVO + SUFFIX_BROWSER]],
    [
      /(avast|avg)\/([\w\.]+)/i
      // Avast/AVG Secure Browser
    ],
    [[NAME, /(.+)/, "$1 Secure" + SUFFIX_BROWSER], VERSION],
    [
      /\bfocus\/([\w\.]+)/i
      // Firefox Focus
    ],
    [VERSION, [NAME, FIREFOX + " Focus"]],
    [
      /\bopt\/([\w\.]+)/i
      // Opera Touch
    ],
    [VERSION, [NAME, OPERA + " Touch"]],
    [
      /coc_coc\w+\/([\w\.]+)/i
      // Coc Coc Browser
    ],
    [VERSION, [NAME, "Coc Coc"]],
    [
      /dolfin\/([\w\.]+)/i
      // Dolphin
    ],
    [VERSION, [NAME, "Dolphin"]],
    [
      /coast\/([\w\.]+)/i
      // Opera Coast
    ],
    [VERSION, [NAME, OPERA + " Coast"]],
    [
      /miuibrowser\/([\w\.]+)/i
      // MIUI Browser
    ],
    [VERSION, [NAME, "MIUI" + SUFFIX_BROWSER]],
    [
      /fxios\/([\w\.-]+)/i
      // Firefox for iOS
    ],
    [VERSION, [NAME, PREFIX_MOBILE + FIREFOX]],
    [
      /\bqihoobrowser\/?([\w\.]*)/i
      // 360
    ],
    [VERSION, [NAME, "360"]],
    [
      /\b(qq)\/([\w\.]+)/i
      // QQ
    ],
    [[NAME, /(.+)/, "$1Browser"], VERSION],
    [
      /(oculus|sailfish|huawei|vivo|pico)browser\/([\w\.]+)/i
    ],
    [[NAME, /(.+)/, "$1" + SUFFIX_BROWSER], VERSION],
    [
      // Oculus/Sailfish/HuaweiBrowser/VivoBrowser/PicoBrowser
      /samsungbrowser\/([\w\.]+)/i
      // Samsung Internet
    ],
    [VERSION, [NAME, SAMSUNG + " Internet"]],
    [
      /metasr[\/ ]?([\d\.]+)/i
      // Sogou Explorer
    ],
    [VERSION, [NAME, SOGOU + " Explorer"]],
    [
      /(sogou)mo\w+\/([\d\.]+)/i
      // Sogou Mobile
    ],
    [[NAME, SOGOU + " Mobile"], VERSION],
    [
      /(electron)\/([\w\.]+) safari/i,
      // Electron-based App
      /(tesla)(?: qtcarbrowser|\/(20\d\d\.[-\w\.]+))/i,
      // Tesla
      /m?(qqbrowser|2345(?=browser|chrome|explorer))\w*[\/ ]?v?([\w\.]+)/i
      // QQ/2345
    ],
    [NAME, VERSION],
    [
      /(lbbrowser|rekonq)/i
      // LieBao Browser/Rekonq
    ],
    [NAME],
    [
      /ome\/([\w\.]+) \w* ?(iron) saf/i,
      // Iron
      /ome\/([\w\.]+).+qihu (360)[es]e/i
      // 360
    ],
    [VERSION, NAME],
    [
      // WebView
      /((?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w\.]+);)/i
      // Facebook App for iOS & Android
    ],
    [[NAME, FACEBOOK], VERSION, [TYPE, INAPP]],
    [
      /(Klarna)\/([\w\.]+)/i,
      // Klarna Shopping Browser for iOS & Android
      /(kakao(?:talk|story))[\/ ]([\w\.]+)/i,
      // Kakao App
      /(naver)\(.*?(\d+\.[\w\.]+).*\)/i,
      // Naver InApp
      /(daum)apps[\/ ]([\w\.]+)/i,
      // Daum App
      /safari (line)\/([\w\.]+)/i,
      // Line App for iOS
      /\b(line)\/([\w\.]+)\/iab/i,
      // Line App for Android
      /(alipay)client\/([\w\.]+)/i,
      // Alipay
      /(twitter)(?:and| f.+e\/([\w\.]+))/i,
      // Twitter
      /(instagram|snapchat)[\/ ]([-\w\.]+)/i
      // Instagram/Snapchat
    ],
    [NAME, VERSION, [TYPE, INAPP]],
    [
      /\bgsa\/([\w\.]+) .*safari\//i
      // Google Search Appliance on iOS
    ],
    [VERSION, [NAME, "GSA"], [TYPE, INAPP]],
    [
      /musical_ly(?:.+app_?version\/|_)([\w\.]+)/i
      // TikTok
    ],
    [VERSION, [NAME, "TikTok"], [TYPE, INAPP]],
    [
      /\[(linkedin)app\]/i
      // LinkedIn App for iOS & Android
    ],
    [NAME, [TYPE, INAPP]],
    [
      /(chromium)[\/ ]([-\w\.]+)/i
      // Chromium
    ],
    [NAME, VERSION],
    [
      /headlesschrome(?:\/([\w\.]+)| )/i
      // Chrome Headless
    ],
    [VERSION, [NAME, CHROME + " Headless"]],
    [
      / wv\).+(chrome)\/([\w\.]+)/i
      // Chrome WebView
    ],
    [[NAME, CHROME + " WebView"], VERSION],
    [
      /droid.+ version\/([\w\.]+)\b.+(?:mobile safari|safari)/i
      // Android Browser
    ],
    [VERSION, [NAME, "Android" + SUFFIX_BROWSER]],
    [
      /chrome\/([\w\.]+) mobile/i
      // Chrome Mobile
    ],
    [VERSION, [NAME, PREFIX_MOBILE + "Chrome"]],
    [
      /(chrome|omniweb|arora|[tizenoka]{5} ?browser)\/v?([\w\.]+)/i
      // Chrome/OmniWeb/Arora/Tizen/Nokia
    ],
    [NAME, VERSION],
    [
      /version\/([\w\.\,]+) .*mobile(?:\/\w+ | ?)safari/i
      // Safari Mobile
    ],
    [VERSION, [NAME, PREFIX_MOBILE + "Safari"]],
    [
      /iphone .*mobile(?:\/\w+ | ?)safari/i
    ],
    [[NAME, PREFIX_MOBILE + "Safari"]],
    [
      /version\/([\w\.\,]+) .*(safari)/i
      // Safari
    ],
    [VERSION, NAME],
    [
      /webkit.+?(mobile ?safari|safari)(\/[\w\.]+)/i
      // Safari < 3.0
    ],
    [NAME, [VERSION, "1"]],
    [
      /(webkit|khtml)\/([\w\.]+)/i
    ],
    [NAME, VERSION],
    [
      // Gecko based
      /(?:mobile|tablet);.*(firefox)\/([\w\.-]+)/i
      // Firefox Mobile
    ],
    [[NAME, PREFIX_MOBILE + FIREFOX], VERSION],
    [
      /(navigator|netscape\d?)\/([-\w\.]+)/i
      // Netscape
    ],
    [[NAME, "Netscape"], VERSION],
    [
      /(wolvic|librewolf)\/([\w\.]+)/i
      // Wolvic/LibreWolf
    ],
    [NAME, VERSION],
    [
      /mobile vr; rv:([\w\.]+)\).+firefox/i
      // Firefox Reality
    ],
    [VERSION, [NAME, FIREFOX + " Reality"]],
    [
      /ekiohf.+(flow)\/([\w\.]+)/i,
      // Flow
      /(swiftfox)/i,
      // Swiftfox
      /(icedragon|iceweasel|camino|chimera|fennec|maemo browser|minimo|conkeror)[\/ ]?([\w\.\+]+)/i,
      // IceDragon/Iceweasel/Camino/Chimera/Fennec/Maemo/Minimo/Conkeror
      /(seamonkey|k-meleon|icecat|iceape|firebird|phoenix|palemoon|basilisk|waterfox)\/([-\w\.]+)$/i,
      // Firefox/SeaMonkey/K-Meleon/IceCat/IceApe/Firebird/Phoenix
      /(firefox)\/([\w\.]+)/i,
      // Other Firefox-based
      /(mozilla)\/([\w\.]+) .+rv\:.+gecko\/\d+/i,
      // Mozilla
      // Other
      /(amaya|dillo|doris|icab|ladybird|lynx|mosaic|netsurf|obigo|polaris|w3m|(?:go|ice|up)[\. ]?browser)[-\/ ]?v?([\w\.]+)/i,
      // Polaris/Lynx/Dillo/iCab/Doris/Amaya/w3m/NetSurf/Obigo/Mosaic/Go/ICE/UP.Browser/Ladybird
      /\b(links) \(([\w\.]+)/i
      // Links
    ],
    [NAME, [VERSION, /_/g, "."]],
    [
      /(cobalt)\/([\w\.]+)/i
      // Cobalt
    ],
    [NAME, [VERSION, /[^\d\.]+./, EMPTY]]
  ],
  cpu: [
    [
      /\b((amd|x|x86[-_]?|wow|win)64)\b/i
      // AMD64 (x64)
    ],
    [[ARCHITECTURE, "amd64"]],
    [
      /(ia32(?=;))/i,
      // IA32 (quicktime)
      /\b((i[346]|x)86)(pc)?\b/i
      // IA32 (x86)
    ],
    [[ARCHITECTURE, "ia32"]],
    [
      /\b(aarch64|arm(v?[89]e?l?|_?64))\b/i
      // ARM64
    ],
    [[ARCHITECTURE, "arm64"]],
    [
      /\b(arm(v[67])?ht?n?[fl]p?)\b/i
      // ARMHF
    ],
    [[ARCHITECTURE, "armhf"]],
    [
      // PocketPC mistakenly identified as PowerPC
      /( (ce|mobile); ppc;|\/[\w\.]+arm\b)/i
    ],
    [[ARCHITECTURE, "arm"]],
    [
      /((ppc|powerpc)(64)?)( mac|;|\))/i
      // PowerPC
    ],
    [[ARCHITECTURE, /ower/, EMPTY, lowerize]],
    [
      / sun4\w[;\)]/i
      // SPARC
    ],
    [[ARCHITECTURE, "sparc"]],
    [
      /\b(avr32|ia64(?=;)|68k(?=\))|\barm(?=v([1-7]|[5-7]1)l?|;|eabi)|(irix|mips|sparc)(64)?\b|pa-risc)/i
      // IA64, 68K, ARM/64, AVR/32, IRIX/64, MIPS/64, SPARC/64, PA-RISC
    ],
    [[ARCHITECTURE, lowerize]]
  ],
  device: [
    [
      //////////////////////////
      // MOBILES & TABLETS
      /////////////////////////
      // Samsung
      /\b(sch-i[89]0\d|shw-m380s|sm-[ptx]\w{2,4}|gt-[pn]\d{2,4}|sgh-t8[56]9|nexus 10)/i
    ],
    [MODEL, [VENDOR, SAMSUNG], [TYPE, TABLET]],
    [
      /\b((?:s[cgp]h|gt|sm)-(?![lr])\w+|sc[g-]?[\d]+a?|galaxy nexus)/i,
      /samsung[- ]((?!sm-[lr])[-\w]+)/i,
      /sec-(sgh\w+)/i
    ],
    [MODEL, [VENDOR, SAMSUNG], [TYPE, MOBILE]],
    [
      // Apple
      /(?:\/|\()(ip(?:hone|od)[\w, ]*)(?:\/|;)/i
      // iPod/iPhone
    ],
    [MODEL, [VENDOR, APPLE], [TYPE, MOBILE]],
    [
      /\((ipad);[-\w\),; ]+apple/i,
      // iPad
      /applecoremedia\/[\w\.]+ \((ipad)/i,
      /\b(ipad)\d\d?,\d\d?[;\]].+ios/i
    ],
    [MODEL, [VENDOR, APPLE], [TYPE, TABLET]],
    [
      /(macintosh);/i
    ],
    [MODEL, [VENDOR, APPLE]],
    [
      // Sharp
      /\b(sh-?[altvz]?\d\d[a-ekm]?)/i
    ],
    [MODEL, [VENDOR, SHARP], [TYPE, MOBILE]],
    [
      // Honor
      /\b((?:brt|eln|hey2?|gdi|jdn)-a?[lnw]09|(?:ag[rm]3?|jdn2|kob2)-a?[lw]0[09]hn)(?: bui|\)|;)/i
    ],
    [MODEL, [VENDOR, HONOR], [TYPE, TABLET]],
    [
      /honor([-\w ]+)[;\)]/i
    ],
    [MODEL, [VENDOR, HONOR], [TYPE, MOBILE]],
    [
      // Huawei
      /\b((?:ag[rs][2356]?k?|bah[234]?|bg[2o]|bt[kv]|cmr|cpn|db[ry]2?|jdn2|got|kob2?k?|mon|pce|scm|sht?|[tw]gr|vrd)-[ad]?[lw][0125][09]b?|605hw|bg2-u03|(?:gem|fdr|m2|ple|t1)-[7a]0[1-4][lu]|t1-a2[13][lw]|mediapad[\w\. ]*(?= bui|\)))\b(?!.+d\/s)/i
    ],
    [MODEL, [VENDOR, HUAWEI], [TYPE, TABLET]],
    [
      /(?:huawei)([-\w ]+)[;\)]/i,
      /\b(nexus 6p|\w{2,4}e?-[atu]?[ln][\dx][012359c][adn]?)\b(?!.+d\/s)/i
    ],
    [MODEL, [VENDOR, HUAWEI], [TYPE, MOBILE]],
    [
      // Xiaomi
      /oid[^\)]+; (2[\dbc]{4}(182|283|rp\w{2})[cgl]|m2105k81a?c)(?: bui|\))/i,
      /\b((?:red)?mi[-_ ]?pad[\w- ]*)(?: bui|\))/i
      // Mi Pad tablets
    ],
    [[MODEL, /_/g, " "], [VENDOR, XIAOMI], [TYPE, TABLET]],
    [
      /\b(poco[\w ]+|m2\d{3}j\d\d[a-z]{2})(?: bui|\))/i,
      // Xiaomi POCO
      /\b; (\w+) build\/hm\1/i,
      // Xiaomi Hongmi 'numeric' models
      /\b(hm[-_ ]?note?[_ ]?(?:\d\w)?) bui/i,
      // Xiaomi Hongmi
      /\b(redmi[\-_ ]?(?:note|k)?[\w_ ]+)(?: bui|\))/i,
      // Xiaomi Redmi
      /oid[^\)]+; (m?[12][0-389][01]\w{3,6}[c-y])( bui|; wv|\))/i,
      // Xiaomi Redmi 'numeric' models
      /\b(mi[-_ ]?(?:a\d|one|one[_ ]plus|note lte|max|cc)?[_ ]?(?:\d?\w?)[_ ]?(?:plus|se|lite|pro)?)(?: bui|\))/i,
      // Xiaomi Mi
      / ([\w ]+) miui\/v?\d/i
    ],
    [[MODEL, /_/g, " "], [VENDOR, XIAOMI], [TYPE, MOBILE]],
    [
      // OPPO
      /; (\w+) bui.+ oppo/i,
      /\b(cph[12]\d{3}|p(?:af|c[al]|d\w|e[ar])[mt]\d0|x9007|a101op)\b/i
    ],
    [MODEL, [VENDOR, OPPO], [TYPE, MOBILE]],
    [
      /\b(opd2(\d{3}a?))(?: bui|\))/i
    ],
    [MODEL, [VENDOR, strMapper, { "OnePlus": ["304", "403", "203"], "*": OPPO }], [TYPE, TABLET]],
    [
      // BLU Vivo Series
      /(vivo (5r?|6|8l?|go|one|s|x[il]?[2-4]?)[\w\+ ]*)(?: bui|\))/i
    ],
    [MODEL, [VENDOR, "BLU"], [TYPE, MOBILE]],
    [
      // Vivo
      /; vivo (\w+)(?: bui|\))/i,
      /\b(v[12]\d{3}\w?[at])(?: bui|;)/i
    ],
    [MODEL, [VENDOR, "Vivo"], [TYPE, MOBILE]],
    [
      // Realme
      /\b(rmx[1-3]\d{3})(?: bui|;|\))/i
    ],
    [MODEL, [VENDOR, "Realme"], [TYPE, MOBILE]],
    [
      // Motorola
      /\b(milestone|droid(?:[2-4x]| (?:bionic|x2|pro|razr))?:?( 4g)?)\b[\w ]+build\//i,
      /\bmot(?:orola)?[- ](\w*)/i,
      /((?:moto(?! 360)[\w\(\) ]+|xt\d{3,4}|nexus 6)(?= bui|\)))/i
    ],
    [MODEL, [VENDOR, MOTOROLA], [TYPE, MOBILE]],
    [
      /\b(mz60\d|xoom[2 ]{0,2}) build\//i
    ],
    [MODEL, [VENDOR, MOTOROLA], [TYPE, TABLET]],
    [
      // LG
      /((?=lg)?[vl]k\-?\d{3}) bui| 3\.[-\w; ]{10}lg?-([06cv9]{3,4})/i
    ],
    [MODEL, [VENDOR, LG], [TYPE, TABLET]],
    [
      /(lm(?:-?f100[nv]?|-[\w\.]+)(?= bui|\))|nexus [45])/i,
      /\blg[-e;\/ ]+(?!.*(?:browser|netcast|android tv|watch))(\w+)/i,
      /\blg-?([\d\w]+) bui/i
    ],
    [MODEL, [VENDOR, LG], [TYPE, MOBILE]],
    [
      // Lenovo
      /(ideatab[-\w ]+|602lv|d-42a|a101lv|a2109a|a3500-hv|s[56]000|pb-6505[my]|tb-?x?\d{3,4}(?:f[cu]|xu|[av])|yt\d?-[jx]?\d+[lfmx])( bui|;|\)|\/)/i,
      /lenovo ?(b[68]0[08]0-?[hf]?|tab(?:[\w- ]+?)|tb[\w-]{6,7})( bui|;|\)|\/)/i
    ],
    [MODEL, [VENDOR, LENOVO], [TYPE, TABLET]],
    [
      // Nokia
      /(nokia) (t[12][01])/i
    ],
    [VENDOR, MODEL, [TYPE, TABLET]],
    [
      /(?:maemo|nokia).*(n900|lumia \d+|rm-\d+)/i,
      /nokia[-_ ]?(([-\w\. ]*))/i
    ],
    [[MODEL, /_/g, " "], [TYPE, MOBILE], [VENDOR, "Nokia"]],
    [
      // Google
      /(pixel (c|tablet))\b/i
      // Google Pixel C/Tablet
    ],
    [MODEL, [VENDOR, GOOGLE], [TYPE, TABLET]],
    [
      /droid.+; (pixel[\daxl ]{0,6})(?: bui|\))/i
      // Google Pixel
    ],
    [MODEL, [VENDOR, GOOGLE], [TYPE, MOBILE]],
    [
      // Sony
      /droid.+; (a?\d[0-2]{2}so|[c-g]\d{4}|so[-gl]\w+|xq-a\w[4-7][12])(?= bui|\).+chrome\/(?![1-6]{0,1}\d\.))/i
    ],
    [MODEL, [VENDOR, SONY], [TYPE, MOBILE]],
    [
      /sony tablet [ps]/i,
      /\b(?:sony)?sgp\w+(?: bui|\))/i
    ],
    [[MODEL, "Xperia Tablet"], [VENDOR, SONY], [TYPE, TABLET]],
    [
      // OnePlus
      / (kb2005|in20[12]5|be20[12][59])\b/i,
      /(?:one)?(?:plus)? (a\d0\d\d)(?: b|\))/i
    ],
    [MODEL, [VENDOR, ONEPLUS], [TYPE, MOBILE]],
    [
      // Amazon
      /(alexa)webm/i,
      /(kf[a-z]{2}wi|aeo(?!bc)\w\w)( bui|\))/i,
      // Kindle Fire without Silk / Echo Show
      /(kf[a-z]+)( bui|\)).+silk\//i
      // Kindle Fire HD
    ],
    [MODEL, [VENDOR, AMAZON], [TYPE, TABLET]],
    [
      /((?:sd|kf)[0349hijorstuw]+)( bui|\)).+silk\//i
      // Fire Phone
    ],
    [[MODEL, /(.+)/g, "Fire Phone $1"], [VENDOR, AMAZON], [TYPE, MOBILE]],
    [
      // BlackBerry
      /(playbook);[-\w\),; ]+(rim)/i
      // BlackBerry PlayBook
    ],
    [MODEL, VENDOR, [TYPE, TABLET]],
    [
      /\b((?:bb[a-f]|st[hv])100-\d)/i,
      /\(bb10; (\w+)/i
      // BlackBerry 10
    ],
    [MODEL, [VENDOR, BLACKBERRY], [TYPE, MOBILE]],
    [
      // Asus
      /(?:\b|asus_)(transfo[prime ]{4,10} \w+|eeepc|slider \w+|nexus 7|padfone|p00[cj])/i
    ],
    [MODEL, [VENDOR, ASUS], [TYPE, TABLET]],
    [
      / (z[bes]6[027][012][km][ls]|zenfone \d\w?)\b/i
    ],
    [MODEL, [VENDOR, ASUS], [TYPE, MOBILE]],
    [
      // HTC
      /(nexus 9)/i
      // HTC Nexus 9
    ],
    [MODEL, [VENDOR, "HTC"], [TYPE, TABLET]],
    [
      /(htc)[-;_ ]{1,2}([\w ]+(?=\)| bui)|\w+)/i,
      // HTC
      // ZTE
      /(zte)[- ]([\w ]+?)(?: bui|\/|\))/i,
      /(alcatel|geeksphone|nexian|panasonic(?!(?:;|\.))|sony(?!-bra))[-_ ]?([-\w]*)/i
      // Alcatel/GeeksPhone/Nexian/Panasonic/Sony
    ],
    [VENDOR, [MODEL, /_/g, " "], [TYPE, MOBILE]],
    [
      // TCL
      /tcl (xess p17aa)/i,
      /droid [\w\.]+; ((?:8[14]9[16]|9(?:0(?:48|60|8[01])|1(?:3[27]|66)|2(?:6[69]|9[56])|466))[gqswx])(_\w(\w|\w\w))?(\)| bui)/i
    ],
    [MODEL, [VENDOR, "TCL"], [TYPE, TABLET]],
    [
      /droid [\w\.]+; (418(?:7d|8v)|5087z|5102l|61(?:02[dh]|25[adfh]|27[ai]|56[dh]|59k|65[ah])|a509dl|t(?:43(?:0w|1[adepqu])|50(?:6d|7[adju])|6(?:09dl|10k|12b|71[efho]|76[hjk])|7(?:66[ahju]|67[hw]|7[045][bh]|71[hk]|73o|76[ho]|79w|81[hks]?|82h|90[bhsy]|99b)|810[hs]))(_\w(\w|\w\w))?(\)| bui)/i
    ],
    [MODEL, [VENDOR, "TCL"], [TYPE, MOBILE]],
    [
      // itel
      /(itel) ((\w+))/i
    ],
    [[VENDOR, lowerize], MODEL, [TYPE, strMapper, { "tablet": ["p10001l", "w7001"], "*": "mobile" }]],
    [
      // Acer
      /droid.+; ([ab][1-7]-?[0178a]\d\d?)/i
    ],
    [MODEL, [VENDOR, "Acer"], [TYPE, TABLET]],
    [
      // Meizu
      /droid.+; (m[1-5] note) bui/i,
      /\bmz-([-\w]{2,})/i
    ],
    [MODEL, [VENDOR, "Meizu"], [TYPE, MOBILE]],
    [
      // Ulefone
      /; ((?:power )?armor(?:[\w ]{0,8}))(?: bui|\))/i
    ],
    [MODEL, [VENDOR, "Ulefone"], [TYPE, MOBILE]],
    [
      // Energizer
      /; (energy ?\w+)(?: bui|\))/i,
      /; energizer ([\w ]+)(?: bui|\))/i
    ],
    [MODEL, [VENDOR, "Energizer"], [TYPE, MOBILE]],
    [
      // Cat
      /; cat (b35);/i,
      /; (b15q?|s22 flip|s48c|s62 pro)(?: bui|\))/i
    ],
    [MODEL, [VENDOR, "Cat"], [TYPE, MOBILE]],
    [
      // Smartfren
      /((?:new )?andromax[\w- ]+)(?: bui|\))/i
    ],
    [MODEL, [VENDOR, "Smartfren"], [TYPE, MOBILE]],
    [
      // Nothing
      /droid.+; (a(?:015|06[35]|142p?))/i
    ],
    [MODEL, [VENDOR, "Nothing"], [TYPE, MOBILE]],
    [
      // Archos
      /; (x67 5g|tikeasy \w+|ac[1789]\d\w+)( b|\))/i,
      /archos ?(5|gamepad2?|([\w ]*[t1789]|hello) ?\d+[\w ]*)( b|\))/i
    ],
    [MODEL, [VENDOR, "Archos"], [TYPE, TABLET]],
    [
      /archos ([\w ]+)( b|\))/i,
      /; (ac[3-6]\d\w{2,8})( b|\))/i
    ],
    [MODEL, [VENDOR, "Archos"], [TYPE, MOBILE]],
    [
      // MIXED
      /(imo) (tab \w+)/i,
      // IMO
      /(infinix) (x1101b?)/i
      // Infinix XPad
    ],
    [VENDOR, MODEL, [TYPE, TABLET]],
    [
      /(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus(?! zenw)|dell|jolla|meizu|motorola|polytron|infinix|tecno|micromax|advan)[-_ ]?([-\w]*)/i,
      // BlackBerry/BenQ/Palm/Sony-Ericsson/Acer/Asus/Dell/Meizu/Motorola/Polytron/Infinix/Tecno/Micromax/Advan
      /; (blu|hmd|imo|tcl)[_ ]([\w\+ ]+?)(?: bui|\)|; r)/i,
      // BLU/HMD/IMO/TCL
      /(hp) ([\w ]+\w)/i,
      // HP iPAQ
      /(microsoft); (lumia[\w ]+)/i,
      // Microsoft Lumia
      /(lenovo)[-_ ]?([-\w ]+?)(?: bui|\)|\/)/i,
      // Lenovo
      /(oppo) ?([\w ]+) bui/i
      // OPPO
    ],
    [VENDOR, MODEL, [TYPE, MOBILE]],
    [
      /(kobo)\s(ereader|touch)/i,
      // Kobo
      /(hp).+(touchpad(?!.+tablet)|tablet)/i,
      // HP TouchPad
      /(kindle)\/([\w\.]+)/i
      // Kindle
    ],
    [VENDOR, MODEL, [TYPE, TABLET]],
    [
      /(surface duo)/i
      // Surface Duo
    ],
    [MODEL, [VENDOR, MICROSOFT], [TYPE, TABLET]],
    [
      /droid [\d\.]+; (fp\du?)(?: b|\))/i
      // Fairphone
    ],
    [MODEL, [VENDOR, "Fairphone"], [TYPE, MOBILE]],
    [
      /((?:tegranote|shield t(?!.+d tv))[\w- ]*?)(?: b|\))/i
      // Nvidia Tablets
    ],
    [MODEL, [VENDOR, NVIDIA], [TYPE, TABLET]],
    [
      /(sprint) (\w+)/i
      // Sprint Phones
    ],
    [VENDOR, MODEL, [TYPE, MOBILE]],
    [
      /(kin\.[onetw]{3})/i
      // Microsoft Kin
    ],
    [[MODEL, /\./g, " "], [VENDOR, MICROSOFT], [TYPE, MOBILE]],
    [
      /droid.+; ([c6]+|et5[16]|mc[239][23]x?|vc8[03]x?)\)/i
      // Zebra
    ],
    [MODEL, [VENDOR, ZEBRA], [TYPE, TABLET]],
    [
      /droid.+; (ec30|ps20|tc[2-8]\d[kx])\)/i
    ],
    [MODEL, [VENDOR, ZEBRA], [TYPE, MOBILE]],
    [
      ///////////////////
      // SMARTTVS
      ///////////////////
      /smart-tv.+(samsung)/i
      // Samsung
    ],
    [VENDOR, [TYPE, SMARTTV]],
    [
      /hbbtv.+maple;(\d+)/i
    ],
    [[MODEL, /^/, "SmartTV"], [VENDOR, SAMSUNG], [TYPE, SMARTTV]],
    [
      /tcast.+(lg)e?. ([-\w]+)/i
      // LG SmartTV
    ],
    [VENDOR, MODEL, [TYPE, SMARTTV]],
    [
      /(nux; netcast.+smarttv|lg (netcast\.tv-201\d|android tv))/i
    ],
    [[VENDOR, LG], [TYPE, SMARTTV]],
    [
      /(apple) ?tv/i
      // Apple TV
    ],
    [VENDOR, [MODEL, APPLE + " TV"], [TYPE, SMARTTV]],
    [
      /crkey.*devicetype\/chromecast/i
      // Google Chromecast Third Generation
    ],
    [[MODEL, CHROMECAST + " Third Generation"], [VENDOR, GOOGLE], [TYPE, SMARTTV]],
    [
      /crkey.*devicetype\/([^/]*)/i
      // Google Chromecast with specific device type
    ],
    [[MODEL, /^/, "Chromecast "], [VENDOR, GOOGLE], [TYPE, SMARTTV]],
    [
      /fuchsia.*crkey/i
      // Google Chromecast Nest Hub
    ],
    [[MODEL, CHROMECAST + " Nest Hub"], [VENDOR, GOOGLE], [TYPE, SMARTTV]],
    [
      /crkey/i
      // Google Chromecast, Linux-based or unknown
    ],
    [[MODEL, CHROMECAST], [VENDOR, GOOGLE], [TYPE, SMARTTV]],
    [
      /(portaltv)/i
      // Facebook Portal TV
    ],
    [MODEL, [VENDOR, FACEBOOK], [TYPE, SMARTTV]],
    [
      /droid.+aft(\w+)( bui|\))/i
      // Fire TV
    ],
    [MODEL, [VENDOR, AMAZON], [TYPE, SMARTTV]],
    [
      /(shield \w+ tv)/i
      // Nvidia Shield TV
    ],
    [MODEL, [VENDOR, NVIDIA], [TYPE, SMARTTV]],
    [
      /\(dtv[\);].+(aquos)/i,
      /(aquos-tv[\w ]+)\)/i
      // Sharp
    ],
    [MODEL, [VENDOR, SHARP], [TYPE, SMARTTV]],
    [
      /(bravia[\w ]+)( bui|\))/i
      // Sony
    ],
    [MODEL, [VENDOR, SONY], [TYPE, SMARTTV]],
    [
      /(mi(tv|box)-?\w+) bui/i
      // Xiaomi
    ],
    [MODEL, [VENDOR, XIAOMI], [TYPE, SMARTTV]],
    [
      /Hbbtv.*(technisat) (.*);/i
      // TechniSAT
    ],
    [VENDOR, MODEL, [TYPE, SMARTTV]],
    [
      /\b(roku)[\dx]*[\)\/]((?:dvp-)?[\d\.]*)/i,
      // Roku
      /hbbtv\/\d+\.\d+\.\d+ +\([\w\+ ]*; *([\w\d][^;]*);([^;]*)/i
      // HbbTV devices
    ],
    [[VENDOR, trim], [MODEL, trim], [TYPE, SMARTTV]],
    [
      // SmartTV from Unidentified Vendors
      /droid.+; ([\w- ]+) (?:android tv|smart[- ]?tv)/i
    ],
    [MODEL, [TYPE, SMARTTV]],
    [
      /\b(android tv|smart[- ]?tv|opera tv|tv; rv:)\b/i
    ],
    [[TYPE, SMARTTV]],
    [
      ///////////////////
      // CONSOLES
      ///////////////////
      /(ouya)/i,
      // Ouya
      /(nintendo) (\w+)/i
      // Nintendo
    ],
    [VENDOR, MODEL, [TYPE, CONSOLE]],
    [
      /droid.+; (shield)( bui|\))/i
      // Nvidia Portable
    ],
    [MODEL, [VENDOR, NVIDIA], [TYPE, CONSOLE]],
    [
      /(playstation \w+)/i
      // Playstation
    ],
    [MODEL, [VENDOR, SONY], [TYPE, CONSOLE]],
    [
      /\b(xbox(?: one)?(?!; xbox))[\); ]/i
      // Microsoft Xbox
    ],
    [MODEL, [VENDOR, MICROSOFT], [TYPE, CONSOLE]],
    [
      ///////////////////
      // WEARABLES
      ///////////////////
      /\b(sm-[lr]\d\d[0156][fnuw]?s?|gear live)\b/i
      // Samsung Galaxy Watch
    ],
    [MODEL, [VENDOR, SAMSUNG], [TYPE, WEARABLE]],
    [
      /((pebble))app/i,
      // Pebble
      /(asus|google|lg|oppo) ((pixel |zen)?watch[\w ]*)( bui|\))/i
      // Asus ZenWatch / LG Watch / Pixel Watch
    ],
    [VENDOR, MODEL, [TYPE, WEARABLE]],
    [
      /(ow(?:19|20)?we?[1-3]{1,3})/i
      // Oppo Watch
    ],
    [MODEL, [VENDOR, OPPO], [TYPE, WEARABLE]],
    [
      /(watch)(?: ?os[,\/]|\d,\d\/)[\d\.]+/i
      // Apple Watch
    ],
    [MODEL, [VENDOR, APPLE], [TYPE, WEARABLE]],
    [
      /(opwwe\d{3})/i
      // OnePlus Watch
    ],
    [MODEL, [VENDOR, ONEPLUS], [TYPE, WEARABLE]],
    [
      /(moto 360)/i
      // Motorola 360
    ],
    [MODEL, [VENDOR, MOTOROLA], [TYPE, WEARABLE]],
    [
      /(smartwatch 3)/i
      // Sony SmartWatch
    ],
    [MODEL, [VENDOR, SONY], [TYPE, WEARABLE]],
    [
      /(g watch r)/i
      // LG G Watch R
    ],
    [MODEL, [VENDOR, LG], [TYPE, WEARABLE]],
    [
      /droid.+; (wt63?0{2,3})\)/i
    ],
    [MODEL, [VENDOR, ZEBRA], [TYPE, WEARABLE]],
    [
      ///////////////////
      // XR
      ///////////////////
      /droid.+; (glass) \d/i
      // Google Glass
    ],
    [MODEL, [VENDOR, GOOGLE], [TYPE, XR]],
    [
      /(pico) (4|neo3(?: link|pro)?)/i
      // Pico
    ],
    [VENDOR, MODEL, [TYPE, XR]],
    [
      /(quest( \d| pro)?s?).+vr/i
      // Meta Quest
    ],
    [MODEL, [VENDOR, FACEBOOK], [TYPE, XR]],
    [
      ///////////////////
      // EMBEDDED
      ///////////////////
      /(tesla)(?: qtcarbrowser|\/[-\w\.]+)/i
      // Tesla
    ],
    [VENDOR, [TYPE, EMBEDDED]],
    [
      /(aeobc)\b/i
      // Echo Dot
    ],
    [MODEL, [VENDOR, AMAZON], [TYPE, EMBEDDED]],
    [
      /(homepod).+mac os/i
      // Apple HomePod
    ],
    [MODEL, [VENDOR, APPLE], [TYPE, EMBEDDED]],
    [
      /windows iot/i
    ],
    [[TYPE, EMBEDDED]],
    [
      ////////////////////
      // MIXED (GENERIC)
      ///////////////////
      /droid .+?; ([^;]+?)(?: bui|; wv\)|\) applew).+?(mobile|vr|\d) safari/i
    ],
    [MODEL, [TYPE, strMapper, { "mobile": "Mobile", "xr": "VR", "*": TABLET }]],
    [
      /\b((tablet|tab)[;\/]|focus\/\d(?!.+mobile))/i
      // Unidentifiable Tablet
    ],
    [[TYPE, TABLET]],
    [
      /(phone|mobile(?:[;\/]| [ \w\/\.]*safari)|pda(?=.+windows ce))/i
      // Unidentifiable Mobile
    ],
    [[TYPE, MOBILE]],
    [
      /droid .+?; ([\w\. -]+)( bui|\))/i
      // Generic Android Device
    ],
    [MODEL, [VENDOR, "Generic"]]
  ],
  engine: [
    [
      /windows.+ edge\/([\w\.]+)/i
      // EdgeHTML
    ],
    [VERSION, [NAME, EDGE + "HTML"]],
    [
      /(arkweb)\/([\w\.]+)/i
      // ArkWeb
    ],
    [NAME, VERSION],
    [
      /webkit\/537\.36.+chrome\/(?!27)([\w\.]+)/i
      // Blink
    ],
    [VERSION, [NAME, "Blink"]],
    [
      /(presto)\/([\w\.]+)/i,
      // Presto
      /(webkit|trident|netfront|netsurf|amaya|lynx|w3m|goanna|servo)\/([\w\.]+)/i,
      // WebKit/Trident/NetFront/NetSurf/Amaya/Lynx/w3m/Goanna/Servo
      /ekioh(flow)\/([\w\.]+)/i,
      // Flow
      /(khtml|tasman|links)[\/ ]\(?([\w\.]+)/i,
      // KHTML/Tasman/Links
      /(icab)[\/ ]([23]\.[\d\.]+)/i,
      // iCab
      /\b(libweb)/i
      // LibWeb
    ],
    [NAME, VERSION],
    [
      /ladybird\//i
    ],
    [[NAME, "LibWeb"]],
    [
      /rv\:([\w\.]{1,9})\b.+(gecko)/i
      // Gecko
    ],
    [VERSION, NAME]
  ],
  os: [
    [
      // Windows
      /microsoft (windows) (vista|xp)/i
      // Windows (iTunes)
    ],
    [NAME, VERSION],
    [
      /(windows (?:phone(?: os)?|mobile|iot))[\/ ]?([\d\.\w ]*)/i
      // Windows Phone
    ],
    [NAME, [VERSION, strMapper, windowsVersionMap]],
    [
      /windows nt 6\.2; (arm)/i,
      // Windows RT
      /windows[\/ ]([ntce\d\. ]+\w)(?!.+xbox)/i,
      /(?:win(?=3|9|n)|win 9x )([nt\d\.]+)/i
    ],
    [[VERSION, strMapper, windowsVersionMap], [NAME, WINDOWS]],
    [
      // iOS/macOS
      /[adehimnop]{4,7}\b(?:.*os ([\w]+) like mac|; opera)/i,
      // iOS
      /(?:ios;fbsv\/|iphone.+ios[\/ ])([\d\.]+)/i,
      /cfnetwork\/.+darwin/i
    ],
    [[VERSION, /_/g, "."], [NAME, "iOS"]],
    [
      /(mac os x) ?([\w\. ]*)/i,
      /(macintosh|mac_powerpc\b)(?!.+haiku)/i
      // Mac OS
    ],
    [[NAME, "macOS"], [VERSION, /_/g, "."]],
    [
      // Google Chromecast
      /android ([\d\.]+).*crkey/i
      // Google Chromecast, Android-based
    ],
    [VERSION, [NAME, CHROMECAST + " Android"]],
    [
      /fuchsia.*crkey\/([\d\.]+)/i
      // Google Chromecast, Fuchsia-based
    ],
    [VERSION, [NAME, CHROMECAST + " Fuchsia"]],
    [
      /crkey\/([\d\.]+).*devicetype\/smartspeaker/i
      // Google Chromecast, Linux-based Smart Speaker
    ],
    [VERSION, [NAME, CHROMECAST + " SmartSpeaker"]],
    [
      /linux.*crkey\/([\d\.]+)/i
      // Google Chromecast, Legacy Linux-based
    ],
    [VERSION, [NAME, CHROMECAST + " Linux"]],
    [
      /crkey\/([\d\.]+)/i
      // Google Chromecast, unknown
    ],
    [VERSION, [NAME, CHROMECAST]],
    [
      // Mobile OSes
      /droid ([\w\.]+)\b.+(android[- ]x86|harmonyos)/i
      // Android-x86/HarmonyOS
    ],
    [VERSION, NAME],
    [
      /(ubuntu) ([\w\.]+) like android/i
      // Ubuntu Touch
    ],
    [[NAME, /(.+)/, "$1 Touch"], VERSION],
    [
      // Android/Blackberry/WebOS/QNX/Bada/RIM/KaiOS/Maemo/MeeGo/S40/Sailfish OS/OpenHarmony/Tizen
      /(android|bada|blackberry|kaios|maemo|meego|openharmony|qnx|rim tablet os|sailfish|series40|symbian|tizen|webos)\w*[-\/\.; ]?([\d\.]*)/i
    ],
    [NAME, VERSION],
    [
      /\(bb(10);/i
      // BlackBerry 10
    ],
    [VERSION, [NAME, BLACKBERRY]],
    [
      /(?:symbian ?os|symbos|s60(?=;)|series ?60)[-\/ ]?([\w\.]*)/i
      // Symbian
    ],
    [VERSION, [NAME, "Symbian"]],
    [
      /mozilla\/[\d\.]+ \((?:mobile|tablet|tv|mobile; [\w ]+); rv:.+ gecko\/([\w\.]+)/i
      // Firefox OS
    ],
    [VERSION, [NAME, FIREFOX + " OS"]],
    [
      /web0s;.+rt(tv)/i,
      /\b(?:hp)?wos(?:browser)?\/([\w\.]+)/i
      // WebOS
    ],
    [VERSION, [NAME, "webOS"]],
    [
      /watch(?: ?os[,\/]|\d,\d\/)([\d\.]+)/i
      // watchOS
    ],
    [VERSION, [NAME, "watchOS"]],
    [
      // Google ChromeOS
      /(cros) [\w]+(?:\)| ([\w\.]+)\b)/i
      // Chromium OS
    ],
    [[NAME, "Chrome OS"], VERSION],
    [
      // Smart TVs
      /panasonic;(viera)/i,
      // Panasonic Viera
      /(netrange)mmh/i,
      // Netrange
      /(nettv)\/(\d+\.[\w\.]+)/i,
      // NetTV
      // Console
      /(nintendo|playstation) (\w+)/i,
      // Nintendo/Playstation
      /(xbox); +xbox ([^\);]+)/i,
      // Microsoft Xbox (360, One, X, S, Series X, Series S)
      /(pico) .+os([\w\.]+)/i,
      // Pico
      // Other
      /\b(joli|palm)\b ?(?:os)?\/?([\w\.]*)/i,
      // Joli/Palm
      /(mint)[\/\(\) ]?(\w*)/i,
      // Mint
      /(mageia|vectorlinux)[; ]/i,
      // Mageia/VectorLinux
      /([kxln]?ubuntu|debian|suse|opensuse|gentoo|arch(?= linux)|slackware|fedora|mandriva|centos|pclinuxos|red ?hat|zenwalk|linpus|raspbian|plan 9|minix|risc os|contiki|deepin|manjaro|elementary os|sabayon|linspire)(?: gnu\/linux)?(?: enterprise)?(?:[- ]linux)?(?:-gnu)?[-\/ ]?(?!chrom|package)([-\w\.]*)/i,
      // Ubuntu/Debian/SUSE/Gentoo/Arch/Slackware/Fedora/Mandriva/CentOS/PCLinuxOS/RedHat/Zenwalk/Linpus/Raspbian/Plan9/Minix/RISCOS/Contiki/Deepin/Manjaro/elementary/Sabayon/Linspire
      /(hurd|linux)(?: arm\w*| x86\w*| ?)([\w\.]*)/i,
      // Hurd/Linux
      /(gnu) ?([\w\.]*)/i,
      // GNU
      /\b([-frentopcghs]{0,5}bsd|dragonfly)[\/ ]?(?!amd|[ix346]{1,2}86)([\w\.]*)/i,
      // FreeBSD/NetBSD/OpenBSD/PC-BSD/GhostBSD/DragonFly
      /(haiku) (\w+)/i
      // Haiku
    ],
    [NAME, VERSION],
    [
      /(sunos) ?([\w\.\d]*)/i
      // Solaris
    ],
    [[NAME, "Solaris"], VERSION],
    [
      /((?:open)?solaris)[-\/ ]?([\w\.]*)/i,
      // Solaris
      /(aix) ((\d)(?=\.|\)| )[\w\.])*/i,
      // AIX
      /\b(beos|os\/2|amigaos|morphos|openvms|fuchsia|hp-ux|serenityos)/i,
      // BeOS/OS2/AmigaOS/MorphOS/OpenVMS/Fuchsia/HP-UX/SerenityOS
      /(unix) ?([\w\.]*)/i
      // UNIX
    ],
    [NAME, VERSION]
  ]
};
var defaultProps = function() {
  var props = { init: {}, isIgnore: {}, isIgnoreRgx: {}, toString: {} };
  setProps.call(props.init, [
    [UA_BROWSER, [NAME, VERSION, MAJOR, TYPE]],
    [UA_CPU, [ARCHITECTURE]],
    [UA_DEVICE, [TYPE, MODEL, VENDOR]],
    [UA_ENGINE, [NAME, VERSION]],
    [UA_OS, [NAME, VERSION]]
  ]);
  setProps.call(props.isIgnore, [
    [UA_BROWSER, [VERSION, MAJOR]],
    [UA_ENGINE, [VERSION]],
    [UA_OS, [VERSION]]
  ]);
  setProps.call(props.isIgnoreRgx, [
    [UA_BROWSER, / ?browser$/i],
    [UA_OS, / ?os$/i]
  ]);
  setProps.call(props.toString, [
    [UA_BROWSER, [NAME, VERSION]],
    [UA_CPU, [ARCHITECTURE]],
    [UA_DEVICE, [VENDOR, MODEL]],
    [UA_ENGINE, [NAME, VERSION]],
    [UA_OS, [NAME, VERSION]]
  ]);
  return props;
}();
var createIData = function(item, itemType) {
  var init_props = defaultProps.init[itemType], is_ignoreProps = defaultProps.isIgnore[itemType] || 0, is_ignoreRgx = defaultProps.isIgnoreRgx[itemType] || 0, toString_props = defaultProps.toString[itemType] || 0;
  function IData() {
    setProps.call(this, init_props);
  }
  IData.prototype.getItem = function() {
    return item;
  };
  IData.prototype.withClientHints = function() {
    if (!NAVIGATOR_UADATA) {
      return item.parseCH().get();
    }
    return NAVIGATOR_UADATA.getHighEntropyValues(CH_ALL_VALUES).then(function(res) {
      return item.setCH(new UACHData(res, false)).parseCH().get();
    });
  };
  IData.prototype.withFeatureCheck = function() {
    return item.detectFeature().get();
  };
  if (itemType != UA_RESULT) {
    IData.prototype.is = function(strToCheck) {
      var is = false;
      for (var i in this) {
        if (this.hasOwnProperty(i) && !has(is_ignoreProps, i) && lowerize(is_ignoreRgx ? strip(is_ignoreRgx, this[i]) : this[i]) == lowerize(is_ignoreRgx ? strip(is_ignoreRgx, strToCheck) : strToCheck)) {
          is = true;
          if (strToCheck != UNDEF_TYPE) break;
        } else if (strToCheck == UNDEF_TYPE && is) {
          is = !is;
          break;
        }
      }
      return is;
    };
    IData.prototype.toString = function() {
      var str = EMPTY;
      for (var i in toString_props) {
        if (typeof this[toString_props[i]] !== UNDEF_TYPE) {
          str += (str ? " " : EMPTY) + this[toString_props[i]];
        }
      }
      return str || UNDEF_TYPE;
    };
  }
  if (!NAVIGATOR_UADATA) {
    IData.prototype.then = function(cb) {
      var that = this;
      var IDataResolve = function() {
        for (var prop in that) {
          if (that.hasOwnProperty(prop)) {
            this[prop] = that[prop];
          }
        }
      };
      IDataResolve.prototype = {
        is: IData.prototype.is,
        toString: IData.prototype.toString
      };
      var resolveData = new IDataResolve();
      cb(resolveData);
      return resolveData;
    };
  }
  return new IData();
};
function UACHData(uach, isHttpUACH) {
  uach = uach || {};
  setProps.call(this, CH_ALL_VALUES);
  if (isHttpUACH) {
    setProps.call(this, [
      [BRANDS, itemListToArray(uach[CH_HEADER])],
      [FULLVERLIST, itemListToArray(uach[CH_HEADER_FULL_VER_LIST])],
      [MOBILE, /\?1/.test(uach[CH_HEADER_MOBILE])],
      [MODEL, stripQuotes(uach[CH_HEADER_MODEL])],
      [PLATFORM, stripQuotes(uach[CH_HEADER_PLATFORM])],
      [PLATFORMVER, stripQuotes(uach[CH_HEADER_PLATFORM_VER])],
      [ARCHITECTURE, stripQuotes(uach[CH_HEADER_ARCH])],
      [FORMFACTORS, itemListToArray(uach[CH_HEADER_FORM_FACTORS])],
      [BITNESS, stripQuotes(uach[CH_HEADER_BITNESS])]
    ]);
  } else {
    for (var prop in uach) {
      if (this.hasOwnProperty(prop) && typeof uach[prop] !== UNDEF_TYPE) this[prop] = uach[prop];
    }
  }
}
function UAItem(itemType, ua, rgxMap, uaCH) {
  this.get = function(prop) {
    if (!prop) return this.data;
    return this.data.hasOwnProperty(prop) ? this.data[prop] : void 0;
  };
  this.set = function(prop, val) {
    this.data[prop] = val;
    return this;
  };
  this.setCH = function(ch) {
    this.uaCH = ch;
    return this;
  };
  this.detectFeature = function() {
    if (NAVIGATOR && NAVIGATOR.userAgent == this.ua) {
      switch (this.itemType) {
        case UA_BROWSER:
          if (NAVIGATOR.brave && typeof NAVIGATOR.brave.isBrave == FUNC_TYPE) {
            this.set(NAME, "Brave");
          }
          break;
        case UA_DEVICE:
          if (!this.get(TYPE) && NAVIGATOR_UADATA && NAVIGATOR_UADATA[MOBILE]) {
            this.set(TYPE, MOBILE);
          }
          if (this.get(MODEL) == "Macintosh" && NAVIGATOR && typeof NAVIGATOR.standalone !== UNDEF_TYPE && NAVIGATOR.maxTouchPoints && NAVIGATOR.maxTouchPoints > 2) {
            this.set(MODEL, "iPad").set(TYPE, TABLET);
          }
          break;
        case UA_OS:
          if (!this.get(NAME) && NAVIGATOR_UADATA && NAVIGATOR_UADATA[PLATFORM]) {
            this.set(NAME, NAVIGATOR_UADATA[PLATFORM]);
          }
          break;
        case UA_RESULT:
          var data = this.data;
          var detect = function(itemType2) {
            return data[itemType2].getItem().detectFeature().get();
          };
          this.set(UA_BROWSER, detect(UA_BROWSER)).set(UA_CPU, detect(UA_CPU)).set(UA_DEVICE, detect(UA_DEVICE)).set(UA_ENGINE, detect(UA_ENGINE)).set(UA_OS, detect(UA_OS));
      }
    }
    return this;
  };
  this.parseUA = function() {
    if (this.itemType != UA_RESULT) {
      rgxMapper.call(this.data, this.ua, this.rgxMap);
    }
    if (this.itemType == UA_BROWSER) {
      this.set(MAJOR, majorize(this.get(VERSION)));
    }
    return this;
  };
  this.parseCH = function() {
    var uaCH2 = this.uaCH, rgxMap2 = this.rgxMap;
    switch (this.itemType) {
      case UA_BROWSER:
      case UA_ENGINE:
        var brands = uaCH2[FULLVERLIST] || uaCH2[BRANDS], prevName;
        if (brands) {
          for (var i in brands) {
            var brandName = brands[i].brand || brands[i], brandVersion = brands[i].version;
            if (this.itemType == UA_BROWSER && !/not.a.brand/i.test(brandName) && (!prevName || /chrom/i.test(prevName) && brandName != CHROMIUM)) {
              brandName = strMapper(brandName, {
                "Chrome": "Google Chrome",
                "Edge": "Microsoft Edge",
                "Chrome WebView": "Android WebView",
                "Chrome Headless": "HeadlessChrome",
                "Huawei Browser": "HuaweiBrowser",
                "MIUI Browser": "Miui Browser",
                "Opera Mobi": "OperaMobile",
                "Yandex": "YaBrowser"
              });
              this.set(NAME, brandName).set(VERSION, brandVersion).set(MAJOR, majorize(brandVersion));
              prevName = brandName;
            }
            if (this.itemType == UA_ENGINE && brandName == CHROMIUM) {
              this.set(VERSION, brandVersion);
            }
          }
        }
        break;
      case UA_CPU:
        var archName = uaCH2[ARCHITECTURE];
        if (archName) {
          if (archName && uaCH2[BITNESS] == "64") archName += "64";
          rgxMapper.call(this.data, archName + ";", rgxMap2);
        }
        break;
      case UA_DEVICE:
        if (uaCH2[MOBILE]) {
          this.set(TYPE, MOBILE);
        }
        if (uaCH2[MODEL]) {
          this.set(MODEL, uaCH2[MODEL]);
          if (!this.get(TYPE) || !this.get(VENDOR)) {
            var reParse = {};
            rgxMapper.call(reParse, "droid 9; " + uaCH2[MODEL] + ")", rgxMap2);
            if (!this.get(TYPE) && !!reParse.type) {
              this.set(TYPE, reParse.type);
            }
            if (!this.get(VENDOR) && !!reParse.vendor) {
              this.set(VENDOR, reParse.vendor);
            }
          }
        }
        if (uaCH2[FORMFACTORS]) {
          var ff;
          if (typeof uaCH2[FORMFACTORS] !== "string") {
            var idx = 0;
            while (!ff && idx < uaCH2[FORMFACTORS].length) {
              ff = strMapper(uaCH2[FORMFACTORS][idx++], formFactorsMap);
            }
          } else {
            ff = strMapper(uaCH2[FORMFACTORS], formFactorsMap);
          }
          this.set(TYPE, ff);
        }
        break;
      case UA_OS:
        var osName = uaCH2[PLATFORM];
        if (osName) {
          var osVersion = uaCH2[PLATFORMVER];
          if (osName == WINDOWS) osVersion = parseInt(majorize(osVersion), 10) >= 13 ? "11" : "10";
          this.set(NAME, osName).set(VERSION, osVersion);
        }
        if (this.get(NAME) == WINDOWS && uaCH2[MODEL] == "Xbox") {
          this.set(NAME, "Xbox").set(VERSION, void 0);
        }
        break;
      case UA_RESULT:
        var data = this.data;
        var parse = function(itemType2) {
          return data[itemType2].getItem().setCH(uaCH2).parseCH().get();
        };
        this.set(UA_BROWSER, parse(UA_BROWSER)).set(UA_CPU, parse(UA_CPU)).set(UA_DEVICE, parse(UA_DEVICE)).set(UA_ENGINE, parse(UA_ENGINE)).set(UA_OS, parse(UA_OS));
    }
    return this;
  };
  setProps.call(this, [
    ["itemType", itemType],
    ["ua", ua],
    ["uaCH", uaCH],
    ["rgxMap", rgxMap],
    ["data", createIData(this, itemType)]
  ]);
  return this;
}
function UAParser(ua, extensions, headers) {
  if (typeof ua === OBJ_TYPE) {
    if (isExtensions(ua, true)) {
      if (typeof extensions === OBJ_TYPE) {
        headers = extensions;
      }
      extensions = ua;
    } else {
      headers = ua;
      extensions = void 0;
    }
    ua = void 0;
  } else if (typeof ua === STR_TYPE && !isExtensions(extensions, true)) {
    headers = extensions;
    extensions = void 0;
  }
  if (headers && typeof headers.append === FUNC_TYPE) {
    var kv = {};
    headers.forEach(function(v, k) {
      kv[k] = v;
    });
    headers = kv;
  }
  if (!(this instanceof UAParser)) {
    return new UAParser(ua, extensions, headers).getResult();
  }
  var userAgent = typeof ua === STR_TYPE ? ua : (
    // Passed user-agent string
    headers && headers[USER_AGENT] ? headers[USER_AGENT] : (
      // User-Agent from passed headers
      NAVIGATOR && NAVIGATOR.userAgent ? NAVIGATOR.userAgent : (
        // navigator.userAgent
        EMPTY
      )
    )
  ), httpUACH = new UACHData(headers, true), regexMap = extensions ? extend(defaultRegexes, extensions) : defaultRegexes, createItemFunc = function(itemType) {
    if (itemType == UA_RESULT) {
      return function() {
        return new UAItem(itemType, userAgent, regexMap, httpUACH).set("ua", userAgent).set(UA_BROWSER, this.getBrowser()).set(UA_CPU, this.getCPU()).set(UA_DEVICE, this.getDevice()).set(UA_ENGINE, this.getEngine()).set(UA_OS, this.getOS()).get();
      };
    } else {
      return function() {
        return new UAItem(itemType, userAgent, regexMap[itemType], httpUACH).parseUA().get();
      };
    }
  };
  setProps.call(this, [
    ["getBrowser", createItemFunc(UA_BROWSER)],
    ["getCPU", createItemFunc(UA_CPU)],
    ["getDevice", createItemFunc(UA_DEVICE)],
    ["getEngine", createItemFunc(UA_ENGINE)],
    ["getOS", createItemFunc(UA_OS)],
    ["getResult", createItemFunc(UA_RESULT)],
    ["getUA", function() {
      return userAgent;
    }],
    ["setUA", function(ua2) {
      if (isString(ua2))
        userAgent = ua2.length > UA_MAX_LENGTH ? trim(ua2, UA_MAX_LENGTH) : ua2;
      return this;
    }]
  ]).setUA(userAgent);
  return this;
}
UAParser.VERSION = LIBVERSION;
UAParser.BROWSER = enumerize([NAME, VERSION, MAJOR, TYPE]);
UAParser.CPU = enumerize([ARCHITECTURE]);
UAParser.DEVICE = enumerize([MODEL, VENDOR, TYPE, CONSOLE, MOBILE, SMARTTV, TABLET, WEARABLE, EMBEDDED]);
UAParser.ENGINE = UAParser.OS = enumerize([NAME, VERSION]);

// src/ua-parser-js/enums/ua-parser-enums.mjs
var Browser = Object.freeze({
  "115": "115",
  "2345": "2345",
  "360": "360",
  ALIPAY: "Alipay",
  AMAYA: "Amaya",
  ANDROID: "Android Browser",
  ARORA: "Arora",
  AVANT: "Avant",
  AVAST: "Avast Secure Browser",
  AVG: "AVG Secure Browser",
  BAIDU: "Baidu Browser",
  BASILISK: "Basilisk",
  BLAZER: "Blazer",
  BLU: "BLU",
  BOLT: "Bolt",
  BOWSER: "Bowser",
  BRAVE: "Brave",
  CAMINO: "Camino",
  CHIMERA: "Chimera",
  CHROME: "Chrome",
  CHROME_HEADLESS: "Chrome Headless",
  CHROME_MOBILE: "Mobile Chrome",
  CHROME_WEBVIEW: "Chrome WebView",
  CHROMIUM: "Chromium",
  COBALT: "Cobalt",
  COC_COC: "Coc Coc",
  CONKEROR: "Conkeror",
  DAUM: "Daum",
  DILLO: "Dillo",
  DOLPHIN: "Dolphin",
  DOOBLE: "Dooble",
  DORIS: "Doris",
  DRAGON: "Dragon",
  DUCKDUCKGO: "DuckDuckGo",
  ECOSIA: "Ecosia",
  EDGE: "Edge",
  EPIPHANY: "Epiphany",
  FACEBOOK: "Facebook",
  FALKON: "Falkon",
  FIREBIRD: "Firebird",
  FIREFOX: "Firefox",
  FIREFOX_FOCUS: "Firefox Focus",
  FIREFOX_MOBILE: "Mobile Firefox",
  FIREFOX_REALITY: "Firefox Reality",
  FENNEC: "Fennec",
  FLOCK: "Flock",
  FLOW: "Flow",
  GO: "GoBrowser",
  GOOGLE_SEARCH: "GSA",
  HELIO: "Helio",
  HEYTAP: "HeyTap",
  HONOR: "Honor",
  HUAWEI: "Huawei Browser",
  ICAB: "iCab",
  ICE: "ICE Browser",
  ICEAPE: "IceApe",
  ICECAT: "IceCat",
  ICEDRAGON: "IceDragon",
  ICEWEASEL: "IceWeasel",
  IE: "IE",
  INSTAGRAM: "Instagram",
  IRIDIUM: "Iridium",
  IRON: "Iron",
  JASMINE: "Jasmine",
  KONQUEROR: "Konqueror",
  KAKAO: "KakaoTalk",
  KHTML: "KHTML",
  K_MELEON: "K-Meleon",
  KLAR: "Klar",
  KLARNA: "Klarna",
  KINDLE: "Kindle",
  LENOVO: "Smart Lenovo Browser",
  LADYBIRD: "Ladybird",
  LG: "LG Browser",
  LIBREWOLF: "LibreWolf",
  LIEBAO: "LBBROWSER",
  LINE: "Line",
  LINKEDIN: "LinkedIn",
  LINKS: "Links",
  LUNASCAPE: "Lunascape",
  LYNX: "Lynx",
  MAEMO: "Maemo Browser",
  MAXTHON: "Maxthon",
  MIDORI: "Midori",
  MINIMO: "Minimo",
  MIUI: "MIUI Browser",
  MOZILLA: "Mozilla",
  MOSAIC: "Mosaic",
  NAVER: "Naver",
  NETFRONT: "NetFront",
  NETSCAPE: "Netscape",
  NETSURF: "Netsurf",
  NOKIA: "Nokia Browser",
  OBIGO: "Obigo",
  OCULUS: "Oculus Browser",
  OMNIWEB: "OmniWeb",
  OPERA: "Opera",
  OPERA_COAST: "Opera Coast",
  OPERA_GX: "Opera GX",
  OPERA_MINI: "Opera Mini",
  OPERA_MOBI: "Opera Mobi",
  OPERA_TABLET: "Opera Tablet",
  OPERA_TOUCH: "Opera Touch",
  OTTER: "Otter",
  OVI: "OviBrowser",
  PALEMOON: "PaleMoon",
  PHANTOMJS: "PhantomJS",
  PHOENIX: "Phoenix",
  PICOBROWSER: "Pico Browser",
  POLARIS: "Polaris",
  PUFFIN: "Puffin",
  QQ: "QQBrowser",
  QQ_LITE: "QQBrowserLite",
  QUARK: "Quark",
  QUPZILLA: "QupZilla",
  QUTEBROWSER: "qutebrowser",
  REKONQ: "rekonq",
  ROCKMELT: "Rockmelt",
  SAFARI: "Safari",
  SAFARI_MOBILE: "Mobile Safari",
  SAILFISH: "Sailfish Browser",
  SAMSUNG: "Samsung Internet",
  SEAMONKEY: "SeaMonkey",
  SILK: "Silk",
  SKYFIRE: "Skyfire",
  SLEIPNIR: "Sleipnir",
  SLIMBOAT: "SlimBoat",
  SLIMBROWSER: "SlimBrowser",
  SLIMJET: "Slimjet",
  SNAPCHAT: "Snapchat",
  SOGOU_EXPLORER: "Sogou Explorer",
  SOGOU_MOBILE: "Sogou Mobile",
  SURF: "Surf",
  SWIFTFOX: "Swiftfox",
  TESLA: "Tesla",
  TIKTOK: "TikTok",
  TIZEN: "Tizen Browser",
  TWITTER: "Twitter",
  UC: "UCBrowser",
  UP: "UP.Browser",
  VIVALDI: "Vivaldi",
  VIVO: "Vivo Browser",
  W3M: "w3m",
  WATERFOX: "Waterfox",
  WEBKIT: "WebKit",
  WECHAT: "WeChat",
  WEIBO: "Weibo",
  WHALE: "Whale",
  WOLVIC: "Wolvic",
  YANDEX: "Yandex"
  // TODO : test!
});
var BrowserType = Object.freeze({
  CRAWLER: "crawler",
  CLI: "cli",
  EMAIL: "email",
  FETCHER: "fetcher",
  INAPP: "inapp",
  MEDIAPLAYER: "mediaplayer",
  LIBRARY: "library"
});
var CPU = Object.freeze({
  "68K": "68k",
  ARM: "arm",
  ARM_64: "arm64",
  ARM_HF: "armhf",
  AVR: "avr",
  AVR_32: "avr32",
  IA64: "ia64",
  IRIX: "irix",
  IRIX_64: "irix64",
  MIPS: "mips",
  MIPS_64: "mips64",
  PA_RISC: "pa-risc",
  PPC: "ppc",
  SPARC: "sparc",
  SPARC_64: "sparc64",
  X86: "ia32",
  X86_64: "amd64"
});
var Device = Object.freeze({
  CONSOLE: "console",
  DESKTOP: "desktop",
  EMBEDDED: "embedded",
  MOBILE: "mobile",
  SMARTTV: "smarttv",
  TABLET: "tablet",
  WEARABLE: "wearable",
  XR: "xr"
});
var Vendor = Object.freeze({
  ACER: "Acer",
  ADVAN: "Advan",
  ALCATEL: "Alcatel",
  APPLE: "Apple",
  AMAZON: "Amazon",
  ARCHOS: "Archos",
  ASUS: "ASUS",
  ATT: "AT&T",
  BENQ: "BenQ",
  BLACKBERRY: "BlackBerry",
  CAT: "Cat",
  DELL: "Dell",
  ENERGIZER: "Energizer",
  ESSENTIAL: "Essential",
  FACEBOOK: "Facebook",
  FAIRPHONE: "Fairphone",
  GEEKSPHONE: "GeeksPhone",
  GENERIC: "Generic",
  GOOGLE: "Google",
  HMD: "HMD",
  HP: "HP",
  HTC: "HTC",
  HUAWEI: "Huawei",
  IMO: "IMO",
  INFINIX: "Infinix",
  ITEL: "itel",
  JOLLA: "Jolla",
  KOBO: "Kobo",
  LENOVO: "Lenovo",
  LG: "LG",
  MEIZU: "Meizu",
  MICROMAX: "Micromax",
  MICROSOFT: "Microsoft",
  MOTOROLA: "Motorola",
  NEXIAN: "Nexian",
  NINTENDO: "Nintendo",
  NOKIA: "Nokia",
  NOTHING: "Nothing",
  NVIDIA: "Nvidia",
  ONEPLUS: "OnePlus",
  OPPO: "OPPO",
  OUYA: "Ouya",
  PALM: "Palm",
  PANASONIC: "Panasonic",
  PEBBLE: "Pebble",
  PICO: "Pico",
  POLYTRON: "Polytron",
  REALME: "Realme",
  RIM: "RIM",
  ROKU: "Roku",
  SAMSUNG: "Samsung",
  SHARP: "Sharp",
  SIEMENS: "Siemens",
  SMARTFREN: "Smartfren",
  SONY: "Sony",
  SPRINT: "Sprint",
  TCL: "TCL",
  TECHNISAT: "TechniSAT",
  TECNO: "Tecno",
  TESLA: "Tesla",
  ULEFONE: "Ulefone",
  VIVO: "Vivo",
  VODAFONE: "Vodafone",
  XBOX: "Xbox",
  XIAOMI: "Xiaomi",
  ZEBRA: "Zebra",
  ZTE: "ZTE"
  // TODO : test!
});
var Engine = Object.freeze({
  AMAYA: "Amaya",
  ARKWEB: "ArkWeb",
  BLINK: "Blink",
  EDGEHTML: "EdgeHTML",
  FLOW: "Flow",
  GECKO: "Gecko",
  GOANNA: "Goanna",
  ICAB: "iCab",
  KHTML: "KHTML",
  LIBWEB: "LibWeb",
  LINKS: "Links",
  LYNX: "Lynx",
  NETFRONT: "NetFront",
  NETSURF: "NetSurf",
  PRESTO: "Presto",
  SERVO: "Servo",
  TASMAN: "Tasman",
  TRIDENT: "Trident",
  W3M: "w3m",
  WEBKIT: "WebKit"
});
var OS = Object.freeze({
  AIX: "AIX",
  AMIGA_OS: "Amiga OS",
  ANDROID: "Android",
  ANDROID_X86: "Android-x86",
  ARCH: "Arch",
  BADA: "Bada",
  BEOS: "BeOS",
  BLACKBERRY: "BlackBerry",
  CENTOS: "CentOS",
  CHROME_OS: "Chrome OS",
  CHROMECAST: "Chromecast",
  CHROMECAST_ANDROID: "Chromecast Android",
  CHROMECAST_FUCHSIA: "Chromecast Fuchsia",
  CHROMECAST_LINUX: "Chromecast Linux",
  CHROMECAST_SMARTSPEAKER: "Chromecast SmartSpeaker",
  CONTIKI: "Contiki",
  DEBIAN: "Debian",
  DEEPIN: "Deepin",
  DRAGONFLY: "DragonFly",
  ELEMENTARY_OS: "elementary OS",
  FEDORA: "Fedora",
  FIREFOX_OS: "Firefox OS",
  FREEBSD: "FreeBSD",
  FUCHSIA: "Fuchsia",
  GENTOO: "Gentoo",
  GHOSTBSD: "GhostBSD",
  GNU: "GNU",
  HAIKU: "Haiku",
  HARMONYOS: "HarmonyOS",
  HP_UX: "HP-UX",
  HURD: "Hurd",
  IOS: "iOS",
  JOLI: "Joli",
  KAIOS: "KaiOS",
  KUBUNTU: "Kubuntu",
  LINPUS: "Linpus",
  LINSPIRE: "Linspire",
  LINUX: "Linux",
  MACOS: "macOS",
  MAEMO: "Maemo",
  MAGEIA: "Mageia",
  MANDRIVA: "Mandriva",
  MANJARO: "Manjaro",
  MEEGO: "MeeGo",
  MINIX: "Minix",
  MINT: "Mint",
  MORPH_OS: "Morph OS",
  NETBSD: "NetBSD",
  NETRANGE: "NetRange",
  NETTV: "NetTV",
  NINTENDO: "Nintendo",
  OPENHARMONY: "OpenHarmony",
  OPENBSD: "OpenBSD",
  OPENVMS: "OpenVMS",
  OS2: "OS/2",
  PALM: "Palm",
  PC_BSD: "PC-BSD",
  PCLINUXOS: "PCLinuxOS",
  PICO: "Pico",
  PLAN9: "Plan9",
  PLAYSTATION: "PlayStation",
  QNX: "QNX",
  RASPBIAN: "Raspbian",
  REDHAT: "RedHat",
  RIM_TABLET_OS: "RIM Tablet OS",
  RISC_OS: "RISC OS",
  SABAYON: "Sabayon",
  SAILFISH: "Sailfish",
  SERENITYOS: "SerenityOS",
  SERIES40: "Series40",
  SLACKWARE: "Slackware",
  SOLARIS: "Solaris",
  SUSE: "SUSE",
  SYMBIAN: "Symbian",
  TIZEN: "Tizen",
  UBUNTU: "Ubuntu",
  UBUNTU_TOUCH: "Ubuntu Touch",
  UNIX: "Unix",
  VECTORLINUX: "VectorLinux",
  WATCHOS: "watchOS",
  WEBOS: "WebOS",
  WINDOWS: "Windows",
  WINDOWS_IOT: "Windows IoT",
  WINDOWS_MOBILE: "Windows Mobile",
  WINDOWS_PHONE: "Windows Phone",
  XBOX: "Xbox",
  ZENWALK: "Zenwalk"
  // TODO : test!
});

// src/ua-parser-js/extensions/ua-parser-extensions.mjs
var MODEL2 = "model";
var NAME2 = "name";
var TYPE2 = "type";
var VENDOR2 = "vendor";
var VERSION2 = "version";
var MOBILE2 = "mobile";
var TABLET2 = "tablet";
var CRAWLER = "crawler";
var CLI = "cli";
var EMAIL = "email";
var FETCHER = "fetcher";
var INAPP2 = "inapp";
var MEDIAPLAYER = "mediaplayer";
var LIBRARY = "library";
var CLIs = Object.freeze({
  browser: [
    // wget / curl / Lynx / ELinks / HTTPie
    [/(wget|curl|lynx|elinks|httpie)[\/ ]\(?([\w\.-]+)/i],
    [NAME2, VERSION2, [TYPE2, CLI]]
  ]
});
var Crawlers = Object.freeze({
  browser: [
    [
      // AhrefsBot - https://ahrefs.com/robot
      // Amazonbot - https://developer.amazon.com/amazonbot
      // Bingbot / AdIdxBot - https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0
      // CCBot - https://commoncrawl.org/faq
      // Dotbot - https://moz.com/help/moz-procedures/crawlers/dotbot
      // DuckDuckBot - http://duckduckgo.com/duckduckbot.html
      // FacebookBot - https://developers.facebook.com/docs/sharing/bot/
      // GPTBot - https://platform.openai.com/docs/gptbot
      // LinkedInBot - http://www.linkedin.com
      // MJ12bot - https://mj12bot.com/
      // MojeekBot - https://www.mojeek.com/bot.html
      // OpenAI's SearchGPT - https://platform.openai.com/docs/bots
      // PerplexityBot - https://perplexity.ai/perplexitybot
      // SeznamBot - http://napoveda.seznam.cz/seznambot-intro
      /((?:adidx|ahrefs|amazon|bing|cc|dot|duckduck|exa|facebook|gpt|linkedin|mj12|mojeek|oai-search|perplexity|semrush|seznam)bot)\/([\w\.-]+)/i,
      // Applebot - http://apple.com/go/applebot
      /(applebot(?:-extended)?)\/?([\w\.]*)/i,
      // Baiduspider https://help.baidu.com/question?prod_id=99&class=0&id=3001
      /(baiduspider[-imagevdonwsfcpr]{0,7})\/?([\w\.]*)/i,
      // ClaudeBot (Anthropic)
      /(claude(?:bot|-web)|anthropic-ai)\/?([\w\.]*)/i,
      // Coc Coc Bot - https://help.coccoc.com/en/search-engine
      /(coccocbot-(?:image|web))\/([\w\.]+)/i,
      // Facebook / Meta 
      // https://developers.facebook.com/docs/sharing/webmasters/web-crawlers
      /(facebook(?:externalhit|catalog)|meta-externalagent)\/([\w\.]+)/i,
      // Googlebot - http://www.google.com/bot.html
      /(google(?:bot|other|-inspectiontool)(?:-image|-video|-news)?|storebot-google)\/?([\w\.]*)/i,
      // Internet Archive (archive.org)
      /(ia_archiver|archive\.org_bot)\/?([\w\.]*)/i,
      // SemrushBot - http://www.semrush.com/bot.html
      /((?:semrush|splitsignal)bot[-abcfimostw]*)\/?([\w\.-]*)/i,
      // Sogou Spider
      /(sogou (?:pic|head|web|orion|news) spider)\/([\w\.]+)/i,
      // Yahoo! Japan - https://support.yahoo-net.jp/PccSearch/s/article/H000007955
      /(y!?j-(?:asr|br[uw]|dscv|mmp|vsidx|wsc))\/([\w\.]+)/i,
      // Yandex Bots - https://yandex.com/bots
      /(yandex(?:(?:mobile)?(?:accessibility|additional|renderresources|screenshot|sprav)?bot|image(?:s|resizer)|video(?:parser)?|blogs|adnet|favicons|fordomain|market|media|metrika|news|ontodb(?:api)?|pagechecker|partner|rca|tracker|turbo|vertis|webmaster|antivirus))\/([\w\.]+)/i,
      // Yeti (Naver)
      /(yeti)\/([\w\.]+)/i,
      // aiHitBot / Diffbot / Linespider / Magpie-Crawler / Omgilibot / OpenAI Image Downloader / Webzio-Extended / Screaming Frog SEO Spider / Timpibot / VelenPublicWebCrawler / YisouSpider / YouBot
      /((?:aihit|diff|timpi|you)bot|omgili(?:bot)?|openai image downloader|(?:magpie-|velenpublicweb)crawler|webzio-extended|(?:screaming frog seo |line|yisou)spider)\/?([\w\.]*)/i
    ],
    [NAME2, VERSION2, [TYPE2, CRAWLER]],
    [
      // Google Bots
      /((?:adsbot|apis|mediapartners)-google(?:-mobile)?|google-?(?:other|cloudvertexbot|extended|safety))/i,
      // AI2Bot - https://allenai.org/crawler
      // Bytespider
      // DataForSeoBot - https://dataforseo.com/dataforseo-bot
      // Huawei AspiegelBot / PetalBot https://aspiegel.com/petalbot
      // ImagesiftBot - https://imagesift.com/about
      // Qihoo 360Spider
      // TurnitinBot - https://www.turnitin.com/robot/crawlerinfo.html
      // Yahoo! Slurp - http://help.yahoo.com/help/us/ysearch/slurp
      /\b(360spider-?(?:image|video)?|bytespider|(?:ai2|aspiegel|dataforseo|imagesift|petal|turnitin)bot|teoma|yahoo! slurp)/i
    ],
    [NAME2, [TYPE2, CRAWLER]]
  ]
});
var ExtraDevices = Object.freeze({
  device: [
    [
      /(nook)[\w ]+build\/(\w+)/i,
      // Nook
      /(dell) (strea[kpr\d ]*[\dko])/i,
      // Dell Streak
      /(le[- ]+pan)[- ]+(\w{1,9}) bui/i,
      // Le Pan Tablets
      /(trinity)[- ]*(t\d{3}) bui/i,
      // Trinity Tablets
      /(gigaset)[- ]+(q\w{1,9}) bui/i,
      // Gigaset Tablets
      /(vodafone) ([\w ]+)(?:\)| bui)/i
      // Vodafone
    ],
    [VENDOR2, MODEL2, [TYPE2, TABLET2]],
    [
      /(u304aa)/i
      // AT&T
    ],
    [MODEL2, [VENDOR2, "AT&T"], [TYPE2, MOBILE2]],
    [
      /\bsie-(\w*)/i
      // Siemens
    ],
    [MODEL2, [VENDOR2, "Siemens"], [TYPE2, MOBILE2]],
    [
      /\b(rct\w+) b/i
      // RCA Tablets
    ],
    [MODEL2, [VENDOR2, "RCA"], [TYPE2, TABLET2]],
    [
      /\b(venue[\d ]{2,7}) b/i
      // Dell Venue Tablets
    ],
    [MODEL2, [VENDOR2, "Dell"], [TYPE2, TABLET2]],
    [
      /\b(q(?:mv|ta)\w+) b/i
      // Verizon Tablet
    ],
    [MODEL2, [VENDOR2, "Verizon"], [TYPE2, TABLET2]],
    [
      /\b(?:barnes[& ]+noble |bn[rt])([\w\+ ]*) b/i
      // Barnes & Noble Tablet
    ],
    [MODEL2, [VENDOR2, "Barnes & Noble"], [TYPE2, TABLET2]],
    [
      /\b(tm\d{3}\w+) b/i
    ],
    [MODEL2, [VENDOR2, "NuVision"], [TYPE2, TABLET2]],
    [
      /\b(k88) b/i
      // ZTE K Series Tablet
    ],
    [MODEL2, [VENDOR2, "ZTE"], [TYPE2, TABLET2]],
    [
      /\b(nx\d{3}j) b/i
      // ZTE Nubia
    ],
    [MODEL2, [VENDOR2, "ZTE"], [TYPE2, MOBILE2]],
    [
      /\b(gen\d{3}) b.+49h/i
      // Swiss GEN Mobile
    ],
    [MODEL2, [VENDOR2, "Swiss"], [TYPE2, MOBILE2]],
    [
      /\b(zur\d{3}) b/i
      // Swiss ZUR Tablet
    ],
    [MODEL2, [VENDOR2, "Swiss"], [TYPE2, TABLET2]],
    [
      /^((zeki)?tb.*\b) b/i
      // Zeki Tablets
    ],
    [MODEL2, [VENDOR2, "Zeki"], [TYPE2, TABLET2]],
    [
      /\b([yr]\d{2}) b/i,
      /\b(?:dragon[- ]+touch |dt)(\w{5}) b/i
      // Dragon Touch Tablet
    ],
    [MODEL2, [VENDOR2, "Dragon Touch"], [TYPE2, TABLET2]],
    [
      /\b(ns-?\w{0,9}) b/i
      // Insignia Tablets
    ],
    [MODEL2, [VENDOR2, "Insignia"], [TYPE2, TABLET2]],
    [
      /\b((nxa|next)-?\w{0,9}) b/i
      // NextBook Tablets
    ],
    [MODEL2, [VENDOR2, "NextBook"], [TYPE2, TABLET2]],
    [
      /\b(xtreme\_)?(v(1[045]|2[015]|[3469]0|7[05])) b/i
      // Voice Xtreme Phones
    ],
    [[VENDOR2, "Voice"], MODEL2, [TYPE2, MOBILE2]],
    [
      /\b(lvtel\-)?(v1[12]) b/i
      // LvTel Phones
    ],
    [[VENDOR2, "LvTel"], MODEL2, [TYPE2, MOBILE2]],
    [
      /\b(ph-1) /i
      // Essential PH-1
    ],
    [MODEL2, [VENDOR2, "Essential"], [TYPE2, MOBILE2]],
    [
      /\b(v(100md|700na|7011|917g).*\b) b/i
      // Envizen Tablets
    ],
    [MODEL2, [VENDOR2, "Envizen"], [TYPE2, TABLET2]],
    [
      /\b(trio[-\w\. ]+) b/i
      // MachSpeed Tablets
    ],
    [MODEL2, [VENDOR2, "MachSpeed"], [TYPE2, TABLET2]],
    [
      /\btu_(1491) b/i
      // Rotor Tablets
    ],
    [MODEL2, [VENDOR2, "Rotor"], [TYPE2, TABLET2]]
  ]
});
var Emails = Object.freeze({
  browser: [
    [
      // Evolution / Kontact/KMail / [Microsoft/Mac] Outlook / Thunderbird
      /(airmail|bluemail|emclient|evolution|foxmail|kmail2?|kontact|(?:microsoft |mac)?outlook(?:-express)?|navermailapp|(?!chrom.+)sparrow|thunderbird|yahoo)(?:m.+ail; |[\/ ])([\w\.]+)/i
    ],
    [NAME2, VERSION2, [TYPE2, EMAIL]]
  ]
});
var Fetchers = Object.freeze({
  browser: [
    [
      // AhrefsSiteAudit - https://ahrefs.com/robot/site-audit
      // ChatGPT-User - https://platform.openai.com/docs/plugins/bot
      // DuckAssistBot - https://duckduckgo.com/duckassistbot/
      // Better Uptime / BingPreview / Mastodon / MicrosoftPreview / Pinterestbot / Redditbot / Rogerbot / SiteAuditBot / Telegrambot / Twitterbot / UptimeRobot
      // Google Site Verifier / Meta / Yahoo! Japan
      // Yandex Bots - https://yandex.com/bots
      /(ahrefssiteaudit|(?:bing|microsoft)preview|chatgpt-user|mastodon|(?:discord|duckassist|linkedin|pinterest|reddit|roger|siteaudit|twitter|uptimero)bot|google-site-verification|meta-externalfetcher|y!?j-dlc|yandex(?:calendar|direct(?:dyn)?|searchshop)|yadirectfetcher)\/([\w\.]+)/i,
      // Bluesky
      /(bluesky) cardyb\/([\w\.]+)/i,
      // Skype
      /(skypeuripreview) preview\/([\w\.]+)/i,
      // Slackbot - https://api.slack.com/robots
      /(slack(?:bot)?(?:-imgproxy|-linkexpanding)?) ([\w\.]+)/i,
      // WhatsApp
      /(whatsapp)\/([\w\.]+)/i
    ],
    [NAME2, VERSION2, [TYPE2, FETCHER]],
    [
      // Google Bots / Cohere / Snapchat / Vercelbot / Yandex Bots
      /((?:better uptime |telegram|vercel)bot|cohere-ai|feedfetcher-google|google(?:imageproxy|-read-aloud|-pagerenderer|producer)|snap url preview|yandex(?:sitelinks|userproxy))/i
    ],
    [NAME2, [TYPE2, FETCHER]]
  ],
  os: [
    [/whatsapp\/[\d\.]+ (a|i)/i],
    [[NAME2, (os) => os == "A" ? "Android" : "iOS"]]
  ]
});
var InApps = Object.freeze({
  browser: [
    // Slack
    [/(?:slack(?=.+electron|.+ios)|chatlyio)\/([\d\.]+)/i],
    [VERSION2, [NAME2, "Slack"], [TYPE2, INAPP2]],
    // Yahoo! Japan
    [/jp\.co\.yahoo\.(?:android\.yjtop|ipn\.appli)\/([\d\.]+)/i],
    [VERSION2, [NAME2, "Yahoo! Japan"], [TYPE2, INAPP2]]
  ]
});
var MediaPlayers = Object.freeze({
  browser: [
    [
      /(apple(?:coremedia|tv))\/([\w\._]+)/i,
      // Generic Apple CoreMedia
      /(coremedia) v([\w\._]+)/i,
      // Ares/Nexplayer/OSSProxy
      /(ares|clementine|music player daemon|nexplayer|ossproxy) ([\w\.-]+)/i,
      // Aqualung/Lyssna/BSPlayer/Clementine/MPD
      // Audacious/AudiMusicStream/Amarok/BASS/OpenCORE/GnomeMplayer/MoC
      // NSPlayer/PSP-InternetRadioPlayer/Videos
      // Nero Home/Nero Scout/Nokia
      // QuickTime/RealMedia/RadioApp/RadioClientApplication/
      // SoundTap/Totem/Stagefright/Streamium
      // XBMC/gvfs/Xine/XMMS/irapp
      /^(aqualung|audacious|audimusicstream|amarok|bass|bsplayer|core|gnomemplayer|gvfs|irapp|lyssna|music on console|nero (?:home|scout)|nokia\d+|nsplayer|psp-internetradioplayer|quicktime|rma|radioapp|radioclientapplication|soundtap|stagefright|streamium|totem|videos|xbmc|xine|xmms)\/([\w\.-]+)/i,
      /(lg player|nexplayer) ([\d\.]+)/i,
      /player\/(nexplayer|lg player) ([\w\.-]+)/i,
      // NexPlayer/LG Player
      /(gstreamer) souphttpsrc.+libsoup\/([\w\.-]+)/i,
      // Gstreamer
      /(htc streaming player) [\w_]+ \/ ([\d\.]+)/i,
      // HTC Streaming Player
      /(lavf)([\d\.]+)/i,
      // Lavf (FFMPEG)
      // MPlayer SVN
      /(mplayer)(?: |\/)(?:(?:sherpya-){0,1}svn)(?:-| )(r\d+(?:-\d+[\w\.-]+))/i,
      / (songbird)\/([\w\.-]+)/i,
      // Songbird/Philips-Songbird
      /(winamp)(?:3 version|mpeg| ) ([\w\.-]+)/i,
      // Winamp
      /(vlc)(?:\/| media player - version )([\w\.-]+)/i,
      // VLC Videolan
      /^(foobar2000|itunes|smp)\/([\d\.]+)/i,
      // Foobar2000/iTunes/SMP
      /com\.(riseupradioalarm)\/([\d\.]*)/i,
      // RiseUP Radio Alarm
      /(mplayer)(?:\s|\/| unknown-)([\w\.\-]+)/i,
      // MPlayer
      // Windows Media Server
      /(windows)\/([\w\.-]+) upnp\/[\d\.]+ dlnadoc\/[\d\.]+ home media server/i
    ],
    [NAME2, VERSION2, [TYPE2, MEDIAPLAYER]],
    [
      /(flrp)\/([\w\.-]+)/i
      // Flip Player
    ],
    [[NAME2, "Flip Player"], VERSION2, [TYPE2, MEDIAPLAYER]],
    [
      // FStream/NativeHost/QuerySeekSpider
      // MPlayer (no other info)/Media Player Classic/Nero ShowTime
      // OCMS-bot/tap in radio/tunein/unknown/winamp (no other info)
      // inlight radio / YourMuze
      /(fstream|media player classic|inlight radio|mplayer|nativehost|nero showtime|ocms-bot|queryseekspider|tapinradio|tunein radio|winamp|yourmuze)/i
    ],
    [NAME2, [TYPE2, MEDIAPLAYER]],
    [
      /(htc_one_s|windows-media-player|wmplayer)\/([\w\.-]+)/i
      // HTC One S / Windows Media Player
    ],
    [[NAME2, /[_-]/g, " "], VERSION2, [TYPE2, MEDIAPLAYER]],
    [
      /(rad.io|radio.(?:de|at|fr)) ([\d\.]+)/i
      // Rad.io
    ],
    [[NAME2, "rad.io"], VERSION2, [TYPE2, MEDIAPLAYER]]
  ]
});
var Libraries = Object.freeze({
  browser: [
    // Apache-HttpClient/Axios/go-http-client/got/GuzzleHttp/Java[-HttpClient]/jsdom/libwww-perl/lua-resty-http/Needle/node-fetch/OkHttp/PHP-SOAP/PostmanRuntime/python-urllib/python-requests/Scrapy/superagent
    [
      /^(apache-httpclient|axios|(?:go|java)-http-client|got|guzzlehttp|java|libwww-perl|lua-resty-http|needle|node-(?:fetch|superagent)|okhttp|php-soap|postmanruntime|python-(?:urllib|requests)|scrapy)\/([\w\.]+)/i,
      /(jsdom|(?<=\()java)\/([\w\.]+)/i
    ],
    [NAME2, VERSION2, [TYPE2, LIBRARY]]
  ]
});
var Vehicles = Object.freeze({
  device: [
    [/aftlbt962e2/i],
    // BMW
    [[VENDOR2, "BMW"]],
    [/dilink.+(byd) auto/i],
    // BYD
    [VENDOR2],
    [/aftlft962x3/i],
    // Jeep
    [[VENDOR2, "Jeep"], [MODEL2, "Wagooner"]],
    [/(rivian) (r1t)/i],
    // Rivian
    [VENDOR2, MODEL2],
    [/vcc.+netfront/i],
    // Volvo
    [[VENDOR2, "Volvo"]]
  ]
});
var Bots = Object.freeze({
  browser: [
    ...CLIs.browser,
    ...Crawlers.browser,
    ...Fetchers.browser,
    ...Libraries.browser
  ],
  os: [
    ...Fetchers.os
  ]
});

// src/ua-parser-js/helpers/detect-europe-js/index.js
var TIMEZONE = {
  ANDORRA: {
    ANDORRA: "Europe/Andorra"
  },
  AUSTRIA: {
    VIENNA: "Europe/Vienna"
  },
  BELGIUM: {
    BRUSSELS: "Europe/Brussels"
  },
  BULGARIA: {
    SOFIA: "Europe/Sofia"
  },
  CROATIA: {
    ZAGREB: "Europe/Zagreb"
  },
  CYPRUS: {
    NICOSIA_EUROPE: "Europe/Nicosia",
    NICOSIA_ASIA: "Asia/Nicosia",
    FAMAGUSTA: "Asia/Famagusta"
  },
  CZECHIA: {
    PRAGUE: "Europe/Prague"
  },
  DENMARK: {
    COPENHAGEN: "Europe/Copenhagen",
    FAROE: "Atlantic/Faroe"
  },
  ESTONIA: {
    TALLINN: "Europe/Tallinn"
  },
  FINLAND: {
    HELSINKI: "Europe/Helsinki",
    MARIEHAMN: "Europe/Mariehamn"
  },
  FRANCE: {
    PARIS: "Europe/Paris",
    CAYENNE: "America/Cayenne",
    GUADELOUPE: "America/Guadeloupe",
    MARIGOT: "America/Marigot",
    MARTINIQUE: "America/Martinique",
    MAYOTTE: "Indian/Mayotte",
    REUNION: "Indian/Reunion"
  },
  GERMANY: {
    BERLIN: "Europe/Berlin",
    BUSINGEN: "Europe/Busingen"
  },
  GREECE: {
    ATHENS: "Europe/Athens"
  },
  HUNGARY: {
    BUDAPEST: "Europe/Budapest"
  },
  ICELAND: {
    REYKJAVIK: "Atlantic/Reykjavik"
  },
  IRELAND: {
    DUBLIN: "Europe/Dublin"
  },
  ITALY: {
    ROME: "Europe/Rome"
  },
  LATVIA: {
    RIGA: "Europe/Riga"
  },
  LIECHTENSTEIN: {
    VADUZ: "Europe/Vaduz"
  },
  LITHUANIA: {
    VILNIUS: "Europe/Vilnius"
  },
  LUXEMBOURG: {
    LUXEMBOURG: "Europe/Luxembourg"
  },
  MALTA: {
    MALTA: "Europe/Malta"
  },
  MONACO: {
    MONACO: "Europe/Monaco"
  },
  NETHERLANDS: {
    AMSTERDAM: "Europe/Amsterdam",
    ARUBA: "America/Aruba",
    CURACAO: "America/Curacao",
    KRALENDIJK: "America/Kralendijk",
    LOWER_PRINCES: "America/Lower_Princes"
  },
  NORWAY: {
    OSLO: "Europe/Oslo",
    JAN_MAYEN: "Atlantic/Jan_Mayen",
    LONGYEARBYEN: "Arctic/Longyearbyen"
  },
  POLAND: {
    WARSAW: "Europe/Warsaw"
  },
  PORTUGAL: {
    LISBON: "Europe/Lisbon",
    AZORES: "Atlantic/Azores",
    MADEIRA: "Atlantic/Madeira"
  },
  ROMANIA: {
    BUCHAREST: "Europe/Bucharest"
  },
  SAN_MARINO: {
    SAN_MARINO: "Europe/San_Marino"
  },
  SLOVAKIA: {
    BRATISLAVA: "Europe/Bratislava"
  },
  SLOVENIA: {
    LJUBLJANA: "Europe/Ljubljana"
  },
  SPAIN: {
    MADRID: "Europe/Madrid",
    CANARY: "Atlantic/Canary",
    CEUTA: "Africa/Ceuta"
  },
  SWEDEN: {
    STOCKHOLM: "Europe/Stockholm"
  },
  SWITZERLAND: {
    ZURICH: "Europe/Zurich"
  },
  VATICAN: {
    VATICAN: "Europe/Vatican"
  }
};
var EU_TIMEZONE = [
  TIMEZONE.AUSTRIA.VIENNA,
  TIMEZONE.BELGIUM.BRUSSELS,
  TIMEZONE.BULGARIA.SOFIA,
  TIMEZONE.CROATIA.ZAGREB,
  TIMEZONE.CYPRUS.NICOSIA_EUROPE,
  TIMEZONE.CYPRUS.NICOSIA_ASIA,
  TIMEZONE.CYPRUS.FAMAGUSTA,
  TIMEZONE.CZECHIA.PRAGUE,
  TIMEZONE.DENMARK.COPENHAGEN,
  TIMEZONE.ESTONIA.TALLINN,
  TIMEZONE.FINLAND.HELSINKI,
  TIMEZONE.FINLAND.MARIEHAMN,
  TIMEZONE.FRANCE.PARIS,
  TIMEZONE.GERMANY.BERLIN,
  TIMEZONE.GREECE.ATHENS,
  TIMEZONE.HUNGARY.BUDAPEST,
  TIMEZONE.IRELAND.DUBLIN,
  TIMEZONE.ITALY.ROME,
  TIMEZONE.LATVIA.RIGA,
  TIMEZONE.LITHUANIA.VILNIUS,
  TIMEZONE.LUXEMBOURG.LUXEMBOURG,
  TIMEZONE.MALTA.MALTA,
  TIMEZONE.NETHERLANDS.AMSTERDAM,
  TIMEZONE.POLAND.WARSAW,
  TIMEZONE.PORTUGAL.LISBON,
  TIMEZONE.ROMANIA.BUCHAREST,
  TIMEZONE.SLOVAKIA.BRATISLAVA,
  TIMEZONE.SLOVENIA.LJUBLJANA,
  TIMEZONE.SPAIN.MADRID,
  TIMEZONE.SWEDEN.STOCKHOLM,
  TIMEZONE.FRANCE.CAYENNE,
  TIMEZONE.FRANCE.GUADELOUPE,
  TIMEZONE.FRANCE.MARIGOT,
  TIMEZONE.FRANCE.MARTINIQUE,
  TIMEZONE.FRANCE.MAYOTTE,
  TIMEZONE.FRANCE.REUNION,
  TIMEZONE.PORTUGAL.AZORES,
  TIMEZONE.PORTUGAL.MADEIRA,
  TIMEZONE.SPAIN.CANARY
];
var EEA_EFTA_TIMEZONE = [
  TIMEZONE.ICELAND.REYKJAVIK,
  TIMEZONE.LIECHTENSTEIN.VADUZ,
  TIMEZONE.NORWAY.OSLO,
  TIMEZONE.NORWAY.JAN_MAYEN
];
var EEA_TIMEZONE = [
  ...EU_TIMEZONE,
  ...EEA_EFTA_TIMEZONE
];
var EFTA_TIMEZONE = [
  TIMEZONE.SWITZERLAND.ZURICH,
  ...EEA_EFTA_TIMEZONE
];
var SCHENGEN_TIMEZONE = [
  TIMEZONE.AUSTRIA.VIENNA,
  TIMEZONE.BELGIUM.BRUSSELS,
  TIMEZONE.BULGARIA.SOFIA,
  TIMEZONE.CROATIA.ZAGREB,
  TIMEZONE.CZECHIA.PRAGUE,
  TIMEZONE.DENMARK.COPENHAGEN,
  TIMEZONE.ESTONIA.TALLINN,
  TIMEZONE.FINLAND.HELSINKI,
  TIMEZONE.FINLAND.MARIEHAMN,
  TIMEZONE.FRANCE.PARIS,
  TIMEZONE.GERMANY.BERLIN,
  TIMEZONE.GREECE.ATHENS,
  TIMEZONE.HUNGARY.BUDAPEST,
  TIMEZONE.ITALY.ROME,
  TIMEZONE.LATVIA.RIGA,
  TIMEZONE.LITHUANIA.VILNIUS,
  TIMEZONE.LUXEMBOURG.LUXEMBOURG,
  TIMEZONE.MALTA.MALTA,
  TIMEZONE.NETHERLANDS.AMSTERDAM,
  TIMEZONE.POLAND.WARSAW,
  TIMEZONE.PORTUGAL.LISBON,
  TIMEZONE.PORTUGAL.AZORES,
  TIMEZONE.PORTUGAL.MADEIRA,
  TIMEZONE.ROMANIA.BUCHAREST,
  TIMEZONE.SLOVAKIA.BRATISLAVA,
  TIMEZONE.SLOVENIA.LJUBLJANA,
  TIMEZONE.SPAIN.MADRID,
  TIMEZONE.SPAIN.CANARY,
  TIMEZONE.SWEDEN.STOCKHOLM,
  TIMEZONE.ANDORRA.ANDORRA,
  TIMEZONE.GERMANY.BUSINGEN,
  TIMEZONE.ICELAND.REYKJAVIK,
  TIMEZONE.LIECHTENSTEIN.VADUZ,
  TIMEZONE.MONACO.MONACO,
  TIMEZONE.NORWAY.OSLO,
  TIMEZONE.SAN_MARINO.SAN_MARINO,
  TIMEZONE.SPAIN.CEUTA,
  TIMEZONE.SWITZERLAND.ZURICH,
  TIMEZONE.VATICAN.VATICAN
];

// src/ua-parser-js/helpers/ua-parser-helpers.mjs
var toResult = (value, head, ext) => typeof value === "string" ? UAParser(value, head, ext) : value;
var isAIBot = (resultOrUA) => [
  // AI2
  "ai2bot",
  // Amazon
  "amazonbot",
  // Anthropic
  "anthropic-ai",
  "claude-web",
  "claudebot",
  // Apple
  "applebot",
  "applebot-extended",
  // ByteDance
  "bytespider",
  // Common Crawl
  "ccbot",
  // DataForSeo
  "dataforseobot",
  // Diffbot
  "diffbot",
  // Google
  "googleother",
  "googleother-image",
  "googleother-video",
  "google-extended",
  // Hive AI
  "imagesiftbot",
  // Huawei
  "petalbot",
  // Meta
  "facebookbot",
  "meta-externalagent",
  // OpenAI
  "gptbot",
  "oai-searchbot",
  // Perplexity
  "perplexitybot",
  // Semrush
  "semrushbot-ocob",
  // Timpi
  "timpibot",
  // Velen.io
  "velenpublicwebcrawler",
  // Webz.io
  "omgili",
  "omgilibot",
  "webzio-extended",
  // You.com
  "youbot",
  // Zyte
  "scrapy"
].includes(String(toResult(resultOrUA, Bots).browser.name).toLowerCase());
var isBot = (resultOrUA) => [
  "cli",
  "crawler",
  "fetcher",
  "library"
].includes(toResult(resultOrUA, Bots).browser.type);

// src/edge-functions/ef.ts
var ef_default = async (request) => {
  const userAgent = request.headers.get("user-agent");
  if (userAgent === null || userAgent === "") {
    return;
  }
  setTimeout(() => incrementInBlob(userAgent, request.url), 0);
};
var config = {
  path: "/*",
  excludedPath: [
    "/.netlify",
    "/*.js",
    "/*.mjs",
    "/*.ts",
    "/*.tsx",
    "/*.css",
    "/*.png",
    "/*.jpg",
    "/*.jpeg",
    "/*.gif",
    "/*.svg",
    "/*.webp",
    "/*.ico",
    "/*.woff2",
    "/*.woff",
    "/*.ttf",
    "/*.eot",
    "/*.otf",
    "/*.mp4",
    "/*.mp3",
    "/*.wav",
    "/*.ogg",
    "/*.m4a",
    "/*.aac",
    "/*.flac",
    "/*.opus",
    "/*.webm",
    "/*.mov",
    "/*.avi",
    "/*.wmv",
    "/*.mkv",
    "/*.webp",
    "/*.avif",
    "/*.bmp",
    "/*.tiff",
    "/*.tif",
    "/*.raw"
  ],
  onError: "bypass"
};
var browserMappings = {
  "Chrome": {
    shortName: "chrome",
    versionType: "single"
  },
  "Mobile Chrome": {
    shortName: "chrome_android",
    versionType: "single"
  },
  "Edge": {
    shortName: "edge",
    versionType: "single"
  },
  "Firefox": {
    shortName: "firefox",
    versionType: "single"
  },
  "Mobile Firefox": {
    shortName: "firefox_android",
    versionType: "single"
  },
  "Safari": {
    shortName: "safari",
    versionType: "double"
  },
  "Mobile Safari": {
    shortName: "safari_ios",
    versionType: "double"
  },
  "Opera": {
    shortName: "opera",
    versionType: "single"
  },
  "Opera Mobi": {
    shortName: "opera_android",
    versionType: "single"
  },
  "Samsung Internet": {
    shortName: "samsunginternet_android",
    versionType: "double"
  },
  "Chrome WebView": {
    shortName: "webview_android",
    versionType: "single"
  },
  "Yandex": {
    shortName: "ya_android",
    versionType: "double"
  },
  "QQBrowser": {
    shortName: "qq_android",
    versionType: "double"
  },
  "UCBrowser": {
    shortName: "uc_android",
    versionType: "double"
  }
};
var botsAndCrawlers = [
  "HeadlessChrome",
  "Googlebot",
  "Bingbot",
  "BingPreview",
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "Sogou Spider",
  "Exabot",
  "facebot",
  "ia_archiver",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "WhatsApp",
  "Discordbot",
  "Pinterestbot",
  "TelegramBot",
  "Googlebot-Image",
  "Googlebot-Video",
  "Googlebot-News",
  "Googlebot-Mobile",
  "Googlebot-AdsBot",
  "AdsBot-Google",
  "AdsBot-Google-Mobile",
  "AdsBot-Google-Mobile-Ads",
  "AdsBot-Google-Mobile-Ads-Image",
  "AdsBot-Google-Mobile-Ads-Video",
  "AdsBot-Google-Mobile-Ads-Video",
  "ImagesiftBot",
  "openai.com/bot",
  "ChatGPT",
  "Statping-ng",
  "DotBot",
  "dotbot",
  "YisouSpider",
  "semrush",
  "rss-parser",
  "Amazonbot",
  "perplexity",
  "miniflux",
  "Privacy Preserving Prefetch Proxy",
  "Expanse",
  "FreshRSS",
  "paloaltonetworks",
  "mechanize",
  "almalabs",
  "almaconnect",
  "WordPress",
  "Micro.blog",
  "feedly",
  "BLEXBot",
  "wpbot",
  "anomify.ai",
  "Owler",
  "DARPResearchBot",
  "aiohttp",
  "sindresorhus/got",
  "ThinkChaos",
  "Friendica",
  "Rome Client",
  "python-httpx",
  "keys-so-bot",
  "W3C_Validator",
  "InternetMeasurement",
  "WPMU DEV"
];
var getBrowserNameAndVersion = (ua, userAgent) => {
  const result = {
    browserName: "",
    version: ""
  };
  if (!browserMappings.hasOwnProperty(ua.browser.name ?? "unknown")) {
    result.browserName = ua.browser.name ?? "unknown";
    result.version = ua.browser.version ?? "unknown";
    return result;
  }
  if (ua.device.type === "mobile" && ua.device.vendor === "Apple" && ua.browser.name != "Mobile Safari") {
    const versionParts2 = (ua.os.version ?? "").split(".");
    result.version = !versionParts2[1] || versionParts2[1] == "0" || versionParts2[1] != "unknown" ? `${versionParts2[0]}` : `${versionParts2[0]}.${versionParts2[1]}`;
    result.browserName = "safari_ios";
    return result;
  }
  const browserMapping = browserMappings[ua.browser.name ?? "unknown"];
  result.browserName = browserMapping.shortName ? browserMapping.shortName : ua.browser.name ?? "unknown";
  const versionParts = (ua.browser.version ?? "unknown").split(".");
  if (browserMapping.versionType === "double") {
    result.version = `${versionParts[0]}.${versionParts[1]}`;
  } else {
    result.version = versionParts[0];
  }
  return result;
};
async function incrementInBlob(userAgent, requestUrl) {
  const debugEnv = Netlify.env.get("BASELINE_ANALYTICS_DEBUG_EDGE_FUNCTION") ?? "false";
  const debug = ["true", "TRUE"].includes(debugEnv) ? true : false;
  const requestTime = (/* @__PURE__ */ new Date()).toISOString();
  const ua = UAParser(userAgent);
  if (isBot(userAgent) || isAIBot(userAgent) || botsAndCrawlers.some(
    (bot) => userAgent.toLowerCase().includes(bot.toLowerCase())
  ) || botsAndCrawlers.some((bot) => ua.browser.name === bot)) {
    if (debug === true) {
      console.log(
        `RequestTime=${requestTime}
UserAgent=${userAgent}
Crawler detected, this impression will not be recorded.
`
      );
    }
    ;
    return;
  }
  const store = getStore({
    name: "netlify-baseline",
    consistency: "strong"
  });
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const bucket = Math.floor(Math.random() * 25).toString().padStart(4, "0");
  const key = `counts/${today}/${bucket}`;
  const current = await store.get(key, { type: "json" }) ?? {};
  let browserName = "";
  let version = "";
  if (ua.browser.name === void 0) {
    browserName = "undefined";
    version = "unknown";
  } else {
    const browserData = getBrowserNameAndVersion(ua, userAgent);
    browserName = browserData.browserName;
    version = browserData.version;
  }
  if (!current.hasOwnProperty(browserName)) {
    current[browserName] = {};
  }
  if (!current[browserName].hasOwnProperty(version)) {
    current[browserName][version] = {
      "count": 0
    };
  }
  ;
  current[browserName][version]["count"] += 1;
  await store.setJSON(key, current).then(() => {
  });
  if (debug === true) {
    console.log(
      `RequestTime=${requestTime}
RequestUrl=${requestUrl}
UserAgent=${userAgent}
` + (ua.device.type === "mobile" && ua.device.vendor === "Apple" && ua.browser.name != "Mobile Safari" ? `detected iOS device with non-Safari browser
` : ``) + (!browserMappings.hasOwnProperty(ua.browser.name ?? "unknown") ? `Browser ${ua.browser.name} will not be mapped to a browser in baseline-browser-mapping.
` : `UAParserResult: browser.name = ${ua.browser.name}, browser.version = ${ua.browser.version}, device.vendor = ${ua.device.vendor}, device.type = ${ua.device.type}
`) + `Incremented ${browserName} version ${version} count in key ${key} by 1
`
    );
  }
  ;
  const expectedDates = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const date = /* @__PURE__ */ new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    })
  );
  const { blobs: allCounts } = await store.list({ prefix: "counts/" });
  for (const blob of allCounts) {
    if (!expectedDates.has(blob.key.split("/")[1])) {
      await store.delete(blob.key).then((value) => {
        console.log(`Cleared blob ${blob.key}`);
      });
    }
  }
  return;
}
export {
  config,
  ef_default as default
};
/*! detectEurope.js v0.1.2
    Determine whether a user is from the European Union (EU) area
    https://github.com/faisalman/detect-europe-js
    Author: Faisal Salman <f@faisalman.com>
    MIT License */
/*! isFrozenUA
    A freeze-test for your user-agent string
    https://github.com/faisalman/ua-is-frozen
    Author: Faisal Salman <f@faisalman.com>
    MIT License */
/*! isStandalonePWA 0.1.1
    Detect if PWA is running in standalone mode
    https://github.com/faisalman/is-standalone-pwa
    Author: Faisal Salman <f@faisalman.com>
    MIT License */
