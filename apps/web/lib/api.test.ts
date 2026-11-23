import { describe, expect, it, vi } from "vitest";
import { ApiError, get } from "./api";

describe("cliente da API (web)", () => {
  it("devolve o JSON quando a API responde", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));
    await expect(get("/series", f)).resolves.toEqual([{ id: 1 }]);
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("timeout vira erro claro, sem deixar a página presa", async () => {
    const f = vi.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init?.signal?.addEventListener("abort", () => rej(new DOMException("t", "TimeoutError"))),
        ),
    ) as unknown as typeof fetch;
    await expect(get("/series", f, 20)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("falha de rede e resposta de erro aparecem como erro, não como dado vazio", async () => {
    await expect(get("/series", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).rejects.toMatchObject({ kind: "network" });
    const e = (await get("/series", vi.fn().mockResolvedValue(new Response("", { status: 502 }))).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe("http");
    expect(e.message).toContain("502");
  });
});
