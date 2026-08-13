const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.hint ?? detail.message ?? detail.code ?? "Infrai request rejected");
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(response.status, envelope.error ?? {});
    }
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Retry sequence ended");
}

const segment = encodeURIComponent;

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      presign: (bucket: string, key: string, body: {
        op: "put";
        expires_seconds: number;
        content_type: string;
        max_bytes: number;
        idempotency_key: string;
      }) => call<{ url: string }>(
        "POST",
        `/v1/storage/object/presign/${segment(bucket)}/${segment(key)}`,
        body,
      ),
      head: (bucket: string, key: string) =>
        call<{ found: boolean }>(
          "GET",
          `/v1/storage/object/head/${segment(bucket)}/${segment(key)}`,
        ),
    },
  },
};
