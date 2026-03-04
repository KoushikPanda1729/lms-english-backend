import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl as cfGetSignedUrl } from "@aws-sdk/cloudfront-signer"
import { Readable } from "stream"
import { Config } from "../config/config"
import { ValidationError } from "../shared/errors"

export class StorageService {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicUrl: string

  constructor() {
    const hasCustomEndpoint = !!Config.STORAGE_ENDPOINT

    this.client = new S3Client({
      // Omit endpoint for real AWS S3 (SDK resolves it from region automatically)
      ...(hasCustomEndpoint && { endpoint: Config.STORAGE_ENDPOINT }),
      region: Config.STORAGE_REGION,
      credentials: {
        accessKeyId: Config.STORAGE_ACCESS_KEY,
        secretAccessKey: Config.STORAGE_SECRET_KEY,
      },
      // forcePathStyle is required for MinIO, must be false for AWS S3
      forcePathStyle: hasCustomEndpoint,
    })

    this.bucket = Config.STORAGE_BUCKET_NAME
    this.publicUrl = Config.STORAGE_PUBLIC_URL.replace(/\/$/, "")
  }

  isConfigured(): boolean {
    return !!(Config.STORAGE_ACCESS_KEY && Config.STORAGE_SECRET_KEY && Config.STORAGE_BUCKET_NAME)
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new ValidationError(
        "Storage not configured. Please set STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY and STORAGE_BUCKET_NAME in your .env file.",
      )
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    )

    return `${this.publicUrl}/${key}`
  }

  async delete(key: string): Promise<void> {
    if (!this.isConfigured()) return

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    const readable = res.Body as Readable
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      readable.on("data", (chunk: Buffer) => chunks.push(chunk))
      readable.on("end", () => resolve(Buffer.concat(chunks)))
      readable.on("error", reject)
    })
  }

  getSignedUrl(key: string, ttlSeconds = 900): string {
    const url = `${this.publicUrl}/${key}`
    return cfGetSignedUrl({
      url,
      keyPairId: Config.CLOUDFRONT_KEY_PAIR_ID,
      privateKey: Config.CLOUDFRONT_PRIVATE_KEY,
      dateLessThan: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    })
  }

  isHlsConfigured(): boolean {
    return !!(Config.CLOUDFRONT_KEY_PAIR_ID && Config.CLOUDFRONT_PRIVATE_KEY)
  }

  // Sign a URL if it's a CloudFront URL and signing is configured.
  // Passes through null, YouTube, or any non-CloudFront URL unchanged.
  signIfNeeded(url: string | null, ttlSeconds = 3600): string | null {
    if (!url) return null
    if (!this.isHlsConfigured()) return url
    if (!url.startsWith(this.publicUrl)) return url // YouTube, external URLs
    const key = this.extractKey(url)
    return this.getSignedUrl(key, ttlSeconds)
  }

  extractKey(url: string): string {
    return url.replace(`${this.publicUrl}/`, "")
  }
}
