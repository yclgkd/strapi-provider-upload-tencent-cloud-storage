# strapi-provider-upload-tencent-cloud-storage

## Resources

- [LICENSE](LICENSE)

## Links

- [Strapi website](https://strapi.io/)
- [Strapi documentation](https://docs.strapi.io)
- [Strapi community on Discord](https://discord.strapi.io)
- [Strapi news on Twitter](https://twitter.com/strapijs)

## Installation

```bash
# using yarn
yarn add strapi-provider-upload-tencent-cloud-storage

# using npm
npm install strapi-provider-upload-tencent-cloud-storage --save
```

## Configuration

- `provider` defines the name of the provider
- `providerOptions` is passed down during the construction of the provider. It contains the following properties:

  - `SecretId` / `SecretKey`: Tencent Cloud API credentials. Required unless you provide `initOptions.getAuthorization` (see [Temporary credentials](#temporary-credentials-getauthorization) below).
  - `Region`: Tencent Cloud COS region (e.g. `ap-shanghai`).
  - `Bucket`: Tencent Cloud COS bucket name (e.g. `mybucket-1250000000`).
  - `ACL`: (optional) `"private"` to keep the bucket private and serve files via signed URLs, or `"default"` (default) to use the bucket's own ACL.
  - `Expires`: (optional) Expiration time of generated signed URLs, in **seconds**. Default `360` (6 minutes).
  - `initOptions`: (optional) Forwarded to the COS SDK constructor. See the full list of [COS init options](https://cloud.tencent.com/document/product/436/8629). Use this to configure `getAuthorization`, custom `Domain`, etc.
  - `uploadOptions`: (optional) Forwarded to `cos.putObject`. See the full list of [putObject options](https://cloud.tencent.com/document/product/436/64980). `Bucket`, `Region`, `Key`, `Body`, `ContentLength` and `ContentType` are managed by the provider and cannot be overridden.
  - `CDNDomain`: (optional) CDN domain used to compose the public file URL. Both `cdn.example.com` and `https://cdn.example.com` are accepted; `https://` is added if no scheme is present, and trailing slashes are stripped.
  - `StorageRootPath`: (optional) Prefix inside the bucket. Trailing slashes are stripped automatically.

See the [documentation about using a provider](https://docs.strapi.io/developer-docs/latest/plugins/upload.html#using-a-provider) for information on installing and using a provider. To understand how environment variables are used in Strapi, please refer to the [documentation about environment variables](https://docs.strapi.io/developer-docs/latest/setup-deployment-guides/configurations/optional/environment.html#environment-variables).

### Provider Configuration

`./config/plugins.js` or `./config/plugins.ts` for TypeScript projects:

```js
module.exports = ({ env }) => ({
  // ...
  upload: {
    config: {
      provider: "strapi-provider-upload-tencent-cloud-storage",
      providerOptions: {
        SecretId: env("COS_SECRET_ID"),
        SecretKey: env("COS_SECRET_KEY"),
        Region: env("COS_REGION"),
        Bucket: env("COS_BUCKET"),
      },
    },
  },
  // ...
});
```

### Configuration for a private COS bucket and signed URLs

If your bucket is configured to be private, you will need to set the `ACL` option to `private` in the `params` object. This will ensure file URLs are signed.

**Note:** If you are using a CDN, the URLs will not be signed.

You can also define the expiration time of the signed URL by setting the `Expires` option in the `providerOptions` object. The default value is 360 seconds (6 minutes).

`./config/plugins.js` or `./config/plugins.ts` for TypeScript projects:

```js
module.exports = ({ env }) => ({
  // ...
  upload: {
    config: {
      provider: "strapi-provider-upload-tencent-cloud-storage",
      providerOptions: {
        SecretId: env("COS_SECRET_ID"),
        SecretKey: env("COS_SECRET_KEY"),
        Region: env("COS_REGION"),
        Bucket: env("COS_BUCKET"),
        ACL: "private", // <= set ACL to private
      },
    },
  },
  // ...
});
```

### Security Middleware Configuration

Due to the default settings in the Strapi Security Middleware you will need to modify the `contentSecurityPolicy` settings to properly see thumbnail previews in the Media Library. You should replace `strapi::security` string with the object bellow instead as explained in the [middleware configuration](https://docs.strapi.io/developer-docs/latest/setup-deployment-guides/configurations/required/middlewares.html#loading-order) documentation.

`./config/middlewares.js` or `./config/middlewares.ts` for TypeScript projects:

```js
module.exports = [
  // ...
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "img-src": [
            "'self'",
            "data:",
            "blob:",
            "market-assets.strapi.io",
            "yourBucketName.cos.yourRegion.myqcloud.com",
          ],
          "media-src": [
            "'self'",
            "data:",
            "blob:",
            "market-assets.strapi.io",
            "yourBucketName.cos.yourRegion.myqcloud.com",
          ],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  // ...
];
```

### Configure the access domain (CDN acceleration)

`./config/plugins.js` or `./config/plugins.ts` for TypeScript projects:

```js
module.exports = ({ env }) => ({
  // ...
  upload: {
    config: {
      provider: "strapi-provider-upload-tencent-cloud-storage",
      providerOptions: {
        CDNDomain: "example-cdn-domain.com", // <= CDN Accelerated Domain
        SecretId: env("COS_SECRET_ID"),
        SecretKey: env("COS_SECRET_KEY"),
        Region: env("COS_REGION"),
        Bucket: env("COS_BUCKET"),
      },
    },
  },
  // ...
});
```

The CDN domain may be passed with or without a scheme — `cdn.example.com`, `https://cdn.example.com` and `https://cdn.example.com/` all produce the same `https://cdn.example.com/<key>` URL.

### Configure a storage path prefix

Use `StorageRootPath` to scope uploads to a sub-path inside the bucket — useful when several Strapi projects share one bucket.

```js
providerOptions: {
  // ...
  StorageRootPath: "my-strapi-app/uploads",
},
```

The provider stores files under `<StorageRootPath>/<file.path>/<hash><ext>`. Trailing slashes on `StorageRootPath` are stripped automatically.

### Temporary credentials (`getAuthorization`)

Instead of static `SecretId` / `SecretKey`, you can let the COS SDK fetch a temporary token via the [`getAuthorization`](https://cloud.tencent.com/document/product/436/12260) callback. Pass the function through `initOptions`:

```js
providerOptions: {
  Region: env("COS_REGION"),
  Bucket: env("COS_BUCKET"),
  initOptions: {
    getAuthorization: (options, callback) => {
      // Call your STS endpoint and invoke callback({ TmpSecretId, TmpSecretKey, SecurityToken, ... })
    },
  },
},
```

When `getAuthorization` is provided, `SecretId` and `SecretKey` are not required.

## Contribution

Feel free to fork and make a Pull Request to this plugin project. All the input is warmly welcome!
