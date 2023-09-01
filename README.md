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

  - SecretId: Tencent Cloud API SecretId
  - SecretKey: Tencent Cloud API SecretKey
  - Region: Tencent Cloud API Region
  - Bucket: Tencent Cloud API Bucket
  - ACL: (optional) ACL applied to the uploaded files.
  - Expires: (optional) Expiration time of the signed URL. Default value is 360 seconds (6 minutes).
  - initOptions: (optional) Options passed to the constructor of the provider. You can find the complete list of [options here](https://cloud.tencent.com/document/product/436/8629#:~:text=%E5%8F%82%E8%A7%81%20demo%20%E7%A4%BA%E4%BE%8B%E3%80%82-,%E9%85%8D%E7%BD%AE%E9%A1%B9,-%E6%9E%84%E9%80%A0%E5%87%BD%E6%95%B0%E5%8F%82%E6%95%B0).
  - uploadOptions: (optional) Options passed to the `upload` method. You can find the complete list of [options here](https://cloud.tencent.com/document/product/436/64980#.E7.AE.80.E5.8D.95.E4.B8.8A.E4.BC.A0.E5.AF.B9.E8.B1.A1).
  - CDNDomain: (optional) CDN Accelerated Domain.
  - StorageRootPath: (optional) The storage path of the file in the bucket.

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
        SecretId: env("COS_SecretId"),
        SecretKey: env("COS_SecretKey"),
        Region: env("COS_Region"),
        Bucket: env("COS_Bucket"),
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
        SecretId: env("COS_SecretId"),
        SecretKey: env("COS_SecretKey"),
        Region: env("COS_Region"),
        Bucket: env("COS_Bucket"),
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
        SecretId: env("COS_SecretId"),
        SecretKey: env("COS_SecretKey"),
        Region: env("COS_Region"),
        Bucket: env("COS_Bucket"),
      },
    },
  },
  // ...
});
```

## Contribution

Feel free to fork and make a Pull Request to this plugin project. All the input is warmly welcome!
