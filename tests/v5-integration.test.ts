// Integration test against the real @strapi/utils@5 package (not mocked),
// to validate that the provider works on a Strapi v5 install. Only the
// COS SDK is mocked, since we cannot reach Tencent Cloud in CI.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
const requireFromHere = createRequire(__filename);
const strapiUtilsPkg = requireFromHere("@strapi/utils/package.json") as {
  version: string;
};

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

describe("Strapi v5 compatibility (real @strapi/utils)", () => {
  it("is actually running against @strapi/utils v5", () => {
    expect(strapiUtilsPkg.version.startsWith("5.")).toBe(true);
  });

  it("upload: uses CDN URL and sets provider on the file", async () => {
    const p = provider.init({
      ...baseConfig,
      CDNDomain: "https://cdn.example.com",
      StorageRootPath: "uploads",
    });
    putObject.mockImplementation((_params, cb) =>
      cb(null, { Location: "bucket.cos.ap-shanghai.myqcloud.com/x" }),
    );
    const file = baseFile({ path: "sub" });
    await p.upload(file as never);

    const call = putObject.mock.calls[0][0];
    expect(call.Bucket).toBe("bucket");
    expect(call.Region).toBe("ap-shanghai");
    expect(call.Key).toBe("uploads/sub/abc123.png");
    expect(call.ContentType).toBe("image/png");
    expect((file as unknown as { url: string }).url).toBe(
      "https://cdn.example.com/uploads/sub/abc123.png",
    );
    expect((file as unknown as { provider: string }).provider).toBe(
      "strapi-provider-upload-tencent-cloud-storage",
    );
  });

  it("delete: calls cos.deleteObject with the right key", async () => {
    const p = provider.init(baseConfig);
    deleteObject.mockImplementation((_params, cb) => cb(null));
    await p.delete(baseFile({ path: "sub" }) as never);
    expect(deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "bucket",
        Region: "ap-shanghai",
        Key: "sub/abc123.png",
      }),
      expect.any(Function),
    );
  });

  it("getSignedUrl: returns a signed URL", async () => {
    const p = provider.init({ ...baseConfig, ACL: "private", Expires: 600 });
    getObjectUrl.mockImplementation((params, cb) => {
      expect(params).toMatchObject({
        Bucket: "bucket",
        Region: "ap-shanghai",
        Key: "abc123.png",
        Sign: true,
        Expires: 600,
        Protocol: "https",
      });
      cb(null, { Url: "https://signed.example/abc123.png?sign=SIG" });
    });
    const result = await p.getSignedUrl(baseFile() as never);
    expect(result).toEqual({
      url: "https://signed.example/abc123.png?sign=SIG",
    });
  });

  it("checkFileSize: throws PayloadTooLargeError from real @strapi/utils v5", async () => {
    const p = provider.init(baseConfig);
    const utils = await import("@strapi/utils");
    expect(() =>
      p.checkFileSize(baseFile({ size: 1024 * 1024 * 10 }) as never, {
        sizeLimit: 1024,
      }),
    ).toThrow(utils.errors.PayloadTooLargeError);
  });

  it("isPrivate: reflects ACL config", () => {
    expect(provider.init(baseConfig).isPrivate()).toBe(false);
    expect(provider.init({ ...baseConfig, ACL: "private" }).isPrivate()).toBe(
      true,
    );
  });
});
