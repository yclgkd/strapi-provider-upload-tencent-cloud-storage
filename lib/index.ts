import type {ReadStream} from 'node:fs';
import COS from 'cos-nodejs-sdk-v5';
import type {COSOptions, PutObjectParams} from 'cos-nodejs-sdk-v5'
import * as utils from '@strapi/utils';

interface File {
  name: string;
  alternativeText?: string;
  caption?: string;
  width?: number;
  height?: number;
  formats?: Record<string, unknown>;
  hash: string;
  ext?: string;
  mime: string;
  // Strapi provides the size in kilobytes rounded to two decimal places here
  size: number;
  url: string;
  previewUrl?: string;
  path?: string;
  provider?: string;
  provider_metadata?: Record<string, unknown>;
  stream: ReadStream;
  buffer?: Buffer;
}

interface ConfigOptions {
  SecretId: string;
  SecretKey: string;
  initOptions?: COSOptions;
  Bucket: string;
  Region: string;
  uploadOptions?: Exclude<PutObjectParams, 'Bucket' | 'Region' | 'Key' | 'Body' | 'ContentLength' | 'ContentType'>
  // access control list for the bucket
  ACL?: 'private' | 'default';
  // the expiration time of the signature file(millisecond)
  Expires?: number;
}

const { PayloadTooLargeError } = utils.errors;
const { kbytesToBytes, bytesToHumanReadable } = utils.file;

export = {
  init(config: ConfigOptions) {
    const {SecretId, SecretKey, Bucket, Region, ACL = 'default', Expires = 3600} = config
    const COSInitConfig = {
      SecretId,
      SecretKey,
      ...config.initOptions
    }
    if((COSInitConfig.SecretId && COSInitConfig.SecretKey) || COSInitConfig.getAuthorization){}
    else throw new Error('getAuthorization or SecretId and SecretKey must be provided')
    // init COS
    const cos = new COS(COSInitConfig);

    return {
      upload,

      uploadStream: upload,

      delete(file: File): Promise<void> {
        const Key = getFileKey(file)
        return new Promise((resolve, reject) => {
          cos.deleteObject(
            {
              Bucket,
              Region,
              Key
            },
            function (err) {
              if (err) return reject(err)
              resolve()
            }
          )
        })
      },

      checkFileSize(file: File, { sizeLimit}: {
        sizeLimit?: number;
      }) {
        const maxSize = 5 * 1024 * 1024 * 1024
        const limit = sizeLimit ? Math.min(sizeLimit, maxSize) : maxSize
        if (kbytesToBytes(file.size) > limit) {
          throw new PayloadTooLargeError(
            `${file.name} exceeds size limit of ${bytesToHumanReadable(limit)}.`
          );
        }
      },

      getSignedUrl(file: File): Promise<{url: string}> {
        const Key = getFileKey(file)
        return new Promise((resolve, reject) => {cos.getObjectUrl(
          {
            Bucket,
            Region,
            Key,
            Sign: true,
            Expires,
            Protocol: 'https'
          },
          function (err, data) {
            if (err) return reject(err)
            resolve({url: data.Url})
          }
        )})
      },

      isPrivate() {
        return ACL === 'private';
      },
    };

    function getFileKey(file: File): string {
      const path = file.path ? `${file.path}/` : '';
      return `${path}${file.hash}${file.ext}`;
    }

    function upload(file: File): Promise<void> {
      if (!file.stream && !file.buffer) return Promise.reject(new Error('Missing Readable Stream or Buffer'));
      const Key = getFileKey(file)
      return new Promise((resolve, reject) => {
        cos.putObject(
          {
            ...config.uploadOptions,
            Bucket,
            Region,
            Key,
            Body: file.stream || file.buffer,
            ContentLength: kbytesToBytes(file.size),
            ContentType: file.mime,
          },
          function (err, data) {
            if (err) return reject(err)
            file.url = `https://${data.Location}`
            file.provider = 'strapi-provider-upload-tencent-cloud-storage'
            resolve()
          }
        )
      })
    }
  }
};
