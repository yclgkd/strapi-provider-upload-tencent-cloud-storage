import { describe, it, expect, vi, beforeEach } from "vitest";

const putObject = vi.fn();
const deleteObject = vi.fn();
const getObjectUrl = vi.fn();

vi.mock("cos-nodejs-sdk-v5", () => {
  const COS = vi.fn().mockImplementation(() => ({
    putObject,
    deleteObject,
    getObjectUrl,
  }));
  return { default: COS };
});

vi.mock("@strapi/utils", () => ({
  errors: {
    PayloadTooLargeError: class PayloadTooLargeError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "PayloadTooLargeError";
      }
    },
  },
  file: {
    kbytesToBytes: (kb: number) => kb * 1024,
    bytesToHumanReadable: (b: number) => `${b}B`,
  },
}));

import provider from "../lib/index";

const baseConfig = {
  SecretId: "id",
  SecretKey: "key",
  Bucket: "bucket",
  Region: "ap-shanghai",
};

const baseFile = (overrides: Record<string, unknown> = {}) => ({
  name: "test.png",
  hash: "abc123",
  ext: ".png",
  mime: "image/png",
  size: 100,
  url: "",
  stream: undefined as unknown,
  buffer: Buffer.from("data"),
  ...overrides,
});

beforeEach(() => {
  putObject.mockReset();
  deleteObject.mockReset();
  getObjectUrl.mockReset();
});

describe("init: credentials precondition", () => {
  it("throws when neither static credentials nor getAuthorization is provided", () => {
    expect(() =>
      provider.init({ Bucket: "bucket", Region: "ap-shanghai" } as never),
    ).toThrow(/getAuthorization or SecretId and SecretKey must be provided/);
  });

  it("throws when only SecretId is provided", () => {
    expect(() =>
      provider.init({
        SecretId: "id",
        Bucket: "bucket",
        Region: "ap-shanghai",
      } as never),
    ).toThrow();
  });

  it("accepts static SecretId + SecretKey", () => {
    expect(() => provider.init(baseConfig)).not.toThrow();
  });

  it("accepts initOptions.getAuthorization without SecretId/SecretKey", () => {
    expect(() =>
      provider.init({
        Bucket: "bucket",
        Region: "ap-shanghai",
        initOptions: {
          getAuthorization: (_options, callback) => callback({} as never),
        },
      }),
    ).not.toThrow();
  });
});

describe("isPrivate", () => {
  it("returns false for default ACL", () => {
    const p = provider.init(baseConfig);
    expect(p.isPrivate()).toBe(false);
  });

  it("returns true when ACL is private", () => {
    const p = provider.init({ ...baseConfig, ACL: "private" });
    expect(p.isPrivate()).toBe(true);
  });
});

describe("upload: file key composition", () => {
  it("uses hash + ext when no path or StorageRootPath", async () => {
    const p = provider.init(baseConfig);
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile() as never);
    expect(putObject.mock.calls[0][0].Key).toBe("abc123.png");
  });

  it("prepends file.path when present", async () => {
    const p = provider.init(baseConfig);
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile({ path: "subdir" }) as never);
    expect(putObject.mock.calls[0][0].Key).toBe("subdir/abc123.png");
  });

  it("prepends StorageRootPath when configured", async () => {
    const p = provider.init({ ...baseConfig, StorageRootPath: "uploads" });
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile() as never);
    expect(putObject.mock.calls[0][0].Key).toBe("uploads/abc123.png");
  });

  it("strips trailing slashes from StorageRootPath", async () => {
    const p = provider.init({ ...baseConfig, StorageRootPath: "uploads///" });
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile() as never);
    expect(putObject.mock.calls[0][0].Key).toBe("uploads/abc123.png");
  });

  it('does not append literal "undefined" when ext is missing', async () => {
    const p = provider.init(baseConfig);
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile({ ext: undefined }) as never);
    expect(putObject.mock.calls[0][0].Key).toBe("abc123");
  });
});

describe("upload: file.url composition (CDN normalization)", () => {
  const runUpload = async (cfg: Record<string, unknown>) => {
    const p = provider.init({ ...baseConfig, ...cfg });
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "bucket.cos.region.myqcloud.com/abc123.png" }),
    );
    const file = baseFile();
    await p.upload(file as never);
    return (file as unknown as { url: string }).url;
  };

  it("uses Location-based https URL when no CDNDomain", async () => {
    const url = await runUpload({});
    expect(url).toBe("https://bucket.cos.region.myqcloud.com/abc123.png");
  });

  it("preserves explicit https scheme on CDNDomain", async () => {
    const url = await runUpload({ CDNDomain: "https://cdn.example.com" });
    expect(url).toBe("https://cdn.example.com/abc123.png");
  });

  it("strips trailing slash on CDNDomain", async () => {
    const url = await runUpload({ CDNDomain: "https://cdn.example.com/" });
    expect(url).toBe("https://cdn.example.com/abc123.png");
  });

  it("prepends https:// when CDNDomain has no scheme", async () => {
    const url = await runUpload({ CDNDomain: "cdn.example.com" });
    expect(url).toBe("https://cdn.example.com/abc123.png");
  });

  it("preserves explicit http scheme on CDNDomain", async () => {
    const url = await runUpload({ CDNDomain: "http://cdn.example.com" });
    expect(url).toBe("http://cdn.example.com/abc123.png");
  });

  it("collapses multiple trailing slashes", async () => {
    const url = await runUpload({ CDNDomain: "https://cdn.example.com///" });
    expect(url).toBe("https://cdn.example.com/abc123.png");
  });
});

describe("upload: ContentType", () => {
  it("passes file.mime as ContentType to putObject", async () => {
    const p = provider.init(baseConfig);
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile({ mime: "image/webp" }) as never);
    expect(putObject.mock.calls[0][0].ContentType).toBe("image/webp");
  });

  it("does not let uploadOptions override ContentType", async () => {
    const p = provider.init({
      ...baseConfig,
      // Cast: ConfigOptions.uploadOptions Omits ContentType, but a JS
      // consumer could still try to pass it — assert it's ignored.
      uploadOptions: {
        ContentType: "application/octet-stream",
      } as never,
    });
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile({ mime: "image/png" }) as never);
    expect(putObject.mock.calls[0][0].ContentType).toBe("image/png");
  });

  it("does not set ContentLength (file.size is rounded KB; left to the SDK)", async () => {
    // Strapi's file.size is rounded to 2 decimal KB and would yield a
    // non-integer byte count via kbytesToBytes. Letting the SDK measure
    // the body itself avoids declaring a wrong Content-Length header.
    const p = provider.init(baseConfig);
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "loc" }),
    );
    await p.upload(baseFile({ size: 0.98 }) as never);
    expect(putObject.mock.calls[0][0].ContentLength).toBeUndefined();
  });
});

describe("uploadStream", () => {
  it("is exposed and aliases upload", async () => {
    const p = provider.init(baseConfig);
    expect(
      typeof (p as unknown as { uploadStream?: unknown }).uploadStream,
    ).toBe("function");
    expect((p as unknown as { uploadStream: unknown }).uploadStream).toBe(
      p.upload,
    );
  });
});

describe("upload: input validation", () => {
  it("rejects when neither stream nor buffer is provided", async () => {
    const p = provider.init(baseConfig);
    await expect(
      p.upload(baseFile({ stream: undefined, buffer: undefined }) as never),
    ).rejects.toThrow(/Missing Readable Stream or Buffer/);
  });
});

describe("getSignedUrl: log redaction", () => {
  it("does not log data.Url (which contains the signature)", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const p = provider.init(baseConfig);
      getObjectUrl.mockImplementation((_params, cb) =>
        cb(null, {
          Url: "https://bucket.cos/abc123.png?sign=SECRETSIG&token=XYZ",
        }),
      );
      await p.getSignedUrl(baseFile() as never);
      const allLogged = debugSpy.mock.calls
        .flat()
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)));
      const joined = allLogged.join(" ");
      expect(joined).not.toContain("SECRETSIG");
      expect(joined).not.toContain("sign=");
    } finally {
      process.env.NODE_ENV = originalEnv;
      debugSpy.mockRestore();
    }
  });
});

describe("checkFileSize", () => {
  it("throws when file size exceeds limit", () => {
    const p = provider.init(baseConfig);
    expect(() =>
      p.checkFileSize(baseFile({ size: 1024 * 1024 * 10 }) as never, {
        sizeLimit: 1024,
      }),
    ).toThrow(/exceeds size limit/);
  });

  it("does not throw when under limit", () => {
    const p = provider.init(baseConfig);
    expect(() =>
      p.checkFileSize(baseFile({ size: 1 }) as never, {
        sizeLimit: 1024 * 1024,
      }),
    ).not.toThrow();
  });
});

describe("delete", () => {
  it("calls cos.deleteObject with Bucket / Region / Key", async () => {
    const p = provider.init(baseConfig);
    deleteObject.mockImplementation((_params, cb) => cb(null));
    await p.delete(baseFile({ path: "x" }) as never);
    expect(deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "bucket",
        Region: "ap-shanghai",
        Key: "x/abc123.png",
      }),
      expect.any(Function),
    );
  });

  it("rejects when cos.deleteObject yields an error", async () => {
    const p = provider.init(baseConfig);
    deleteObject.mockImplementation((_params, cb) => cb(new Error("boom")));
    await expect(p.delete(baseFile() as never)).rejects.toThrow("boom");
  });
});
