import ffmpeg from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
import fs from "fs"
import path from "path"
import os from "os"
import { StorageService } from "./storage.service"

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

export class HlsService {
  constructor(private readonly storageService: StorageService) {}

  // Convert video buffer → HLS segments → upload to S3
  // Returns the S3 key prefix (hlsPath) e.g. "courses/{courseId}/lessons/{lessonId}/hls"
  async convertAndUpload(buffer: Buffer, hlsPath: string, mimeType: string): Promise<void> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hls-"))
    const ext = mimeType === "video/quicktime" ? "mov" : "mp4"
    const inputPath = path.join(tmpDir, `input.${ext}`)
    const hlsDir = path.join(tmpDir, "hls")

    fs.writeFileSync(inputPath, buffer)
    fs.mkdirSync(hlsDir)

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .videoCodec("libx264")
          .audioCodec("aac")
          .addOptions([
            "-preset fast",
            "-crf 23",
            "-b:a 128k",
            "-hls_time 2",
            "-hls_list_size 0",
            `-hls_segment_filename ${path.join(hlsDir, "seg_%03d.ts")}`,
          ])
          .output(path.join(hlsDir, "playlist.m3u8"))
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run()
      })

      // Upload all generated files to S3
      const files = fs.readdirSync(hlsDir)
      for (const file of files) {
        const filePath = path.join(hlsDir, file)
        const content = fs.readFileSync(filePath)
        const contentType = file.endsWith(".m3u8") ? "application/x-mpegURL" : "video/MP2T"
        await this.storageService.upload(`${hlsPath}/${file}`, content, contentType)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  // Delete all S3 HLS files for a given hlsPath prefix
  async deleteHls(hlsPath: string): Promise<void> {
    // We delete known files: playlist.m3u8 + segments (best-effort, ignore errors)
    // In production you'd use S3 ListObjects to find all files
    const promises: Promise<void>[] = []
    promises.push(
      this.storageService.delete(`${hlsPath}/playlist.m3u8`).catch(() => null as unknown as void),
    )
    // Attempt to delete up to 500 segments (covers ~33 min at 4s per segment)
    for (let i = 0; i < 500; i++) {
      const seg = `${hlsPath}/seg_${String(i).padStart(3, "0")}.ts`
      promises.push(this.storageService.delete(seg).catch(() => null as unknown as void))
    }
    await Promise.all(promises)
  }

  // Read m3u8 from S3 and rewrite segment filenames to signed CloudFront URLs
  async buildSignedM3u8(hlsPath: string): Promise<string> {
    const m3u8Buffer = await this.storageService.getObject(`${hlsPath}/playlist.m3u8`)
    const m3u8 = m3u8Buffer.toString("utf-8")

    const lines = m3u8.split("\n")
    const signed = lines.map((line) => {
      const trimmed = line.trim()
      if (trimmed.endsWith(".ts")) {
        return this.storageService.getSignedUrl(`${hlsPath}/${trimmed}`, 900)
      }
      return line
    })

    return signed.join("\n")
  }
}
