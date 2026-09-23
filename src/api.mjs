const DEFAULT_API_URL = "/api/v1";

export class ApiError extends Error {
  constructor(code, message, details, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function getRuntimeConfig(runtime = globalThis.SC_TRACKER_CONFIG ?? {}) {
  return {
    apiUrl: trimTrailingSlash(runtime.SC_TRACKER_API_URL ?? runtime.apiUrl ?? DEFAULT_API_URL),
    mockApi: runtime.mockApi === true,
  };
}

async function parseResponse(response) {
  const contentType = response.headers?.get?.("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const apiError = payload?.error;
    throw new ApiError(
      apiError?.code ?? "HTTP_ERROR",
      apiError?.message ?? `Request failed with status ${response.status}`,
      apiError?.details,
      response.status,
    );
  }

  if (!payload || !Object.hasOwn(payload, "data")) {
    throw new ApiError(
      "INVALID_RESPONSE",
      "The API response does not contain a data envelope.",
      payload,
      response.status,
    );
  }

  return payload;
}

function createMockStore() {
  return {
    suppliers: [],
    plots: [],
    shipments: [],
    analyses: new Map(),
    evidencePacks: new Map(),
    ddsSubmissions: new Map(),
    documents: new Map(),
  };
}

function mockId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;
}

function createMockTransport(store = createMockStore()) {
  return {
    async list(resource) {
      return { data: store[resource], meta: { mock: true } };
    },
    async create(resource, input) {
      const item = { id: mockId(resource.slice(0, 3)), ...input, status: input.status ?? "created" };
      store[resource].push(item);
      return { data: item, meta: { mock: true } };
    },
    async createJob(resource, input) {
      const id = mockId(resource);
      const item = { id, ...input, status: "completed", downloadUrl: resource === "evidence" ? "#" : undefined };
      const map = resource === "analysis"
        ? store.analyses
        : resource === "evidence"
          ? store.evidencePacks
          : store.ddsSubmissions;
      map.set(id, item);
      return { data: item, meta: { mock: true } };
    },
    async getJob(resource, id) {
      const map = resource === "analysis"
        ? store.analyses
        : resource === "evidence"
          ? store.evidencePacks
          : store.ddsSubmissions;
      const item = map.get(id);
      if (!item) {
        throw new ApiError("NOT_FOUND", "Mock resource not found.", { id }, 404);
      }
      return { data: item, meta: { mock: true } };
    },
    async upload(file) {
      const id = mockId("doc");
      const document = {
        id,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        status: "completed",
      };
      store.documents.set(id, document);
      return { data: document, meta: { mock: true } };
    },
  };
}

export function createApiClient(options = {}) {
  const config = getRuntimeConfig(options.config);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenProvider = options.tokenProvider;
  const onUnauthorized = options.onUnauthorized;
  const mock = config.mockApi ? createMockTransport(options.mockStore) : null;

  async function request(path, init = {}) {
    if (!fetchImpl) {
      throw new ApiError("NETWORK_UNAVAILABLE", "Fetch is not available.");
    }
    if (!tokenProvider) {
      throw new ApiError(
        "AUTH_NOT_CONFIGURED",
        "Neon Auth token provider is not configured.",
        undefined,
        0,
      );
    }
    const token = await tokenProvider();
    if (!token) {
      throw new ApiError("AUTH_REQUIRED", "Sign in and select an organization.", undefined, 401);
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetchImpl(`${config.apiUrl}${path}`, { ...init, headers });
    if (response.status === 401 && onUnauthorized) {
      await onUnauthorized();
    }
    return parseResponse(response);
  }

  const json = (method, path, body) =>
    request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    config,
    suppliers: {
      list: () => mock ? mock.list("suppliers") : request("/suppliers"),
      create: (input) => mock ? mock.create("suppliers", input) : json("POST", "/suppliers", input),
    },
    plots: {
      list: () => mock ? mock.list("plots") : request("/plots"),
      create: (input) => mock ? mock.create("plots", input) : json("POST", "/plots", input),
    },
    shipments: {
      list: () => mock ? mock.list("shipments") : request("/shipments"),
      create: (input) => mock ? mock.create("shipments", input) : json("POST", "/shipments", input),
    },
    documents: {
      upload: async (file, metadata = {}) => {
        if (mock) return mock.upload(file);
        const initiated = await json("POST", "/documents/uploads", {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          ...metadata,
        });
        const { uploadUrl, documentId, id } = initiated.data;
        const resolvedId = documentId ?? id;
        if (!uploadUrl || !resolvedId) {
          throw new ApiError("INVALID_RESPONSE", "Upload initiation omitted uploadUrl or documentId.", initiated.data);
        }
        const uploadResponse = await fetchImpl(uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new ApiError("UPLOAD_FAILED", `Document upload failed with status ${uploadResponse.status}.`, undefined, uploadResponse.status);
        }
        return json("POST", `/documents/${encodeURIComponent(resolvedId)}/complete`, {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        });
      },
    },
    analyses: {
      create: (input) => mock ? mock.createJob("analysis", input) : json("POST", "/analyses", input),
      get: (id) => mock ? mock.getJob("analysis", id) : request(`/analyses/${encodeURIComponent(id)}`),
    },
    evidencePacks: {
      create: (input) => mock ? mock.createJob("evidence", input) : json("POST", "/evidence-packs", input),
      get: (id) => mock ? mock.getJob("evidence", id) : request(`/evidence-packs/${encodeURIComponent(id)}`),
    },
    dds: {
      create: (input) => mock ? mock.createJob("dds", input) : json("POST", "/dds/submissions", input),
      get: (id) => mock ? mock.getJob("dds", id) : request(`/dds/submissions/${encodeURIComponent(id)}`),
    },
    administration: {
      users: () => request("/admin/users"),
      createUser: (input) => json("POST", "/admin/users", input),
      saveUser: (actorId, input) =>
        json("PUT", `/admin/identity/users/${encodeURIComponent(actorId)}`, input),
      devices: () => request("/admin/devices"),
      deviceAttestations: (deviceId) =>
        request(`/admin/devices/${encodeURIComponent(deviceId)}/attestations`),
      setDeviceStatus: (deviceId, input) =>
        json("POST", `/admin/identity/devices/${encodeURIComponent(deviceId)}/status`, input),
      keys: () => request("/admin/keys"),
      trustHistory: (scopeType, scopeId) =>
        request(
          `/admin/identity/trust/history?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`,
        ),
      setUserTrust: (actorId, input) =>
        json("PATCH", `/admin/users/${encodeURIComponent(actorId)}/trust`, input),
      setDeviceTrust: (deviceId, input) =>
        json("PATCH", `/admin/devices/${encodeURIComponent(deviceId)}/trust`, input),
      revokeKey: (keyId, reason) =>
        json("POST", `/admin/keys/${encodeURIComponent(keyId)}/revoke`, { reason }),
    },
  };
}
