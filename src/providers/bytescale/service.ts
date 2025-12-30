import { AbstractFileProviderService, MedusaError } from "@medusajs/framework/utils"
import {
  ProviderUploadFileDTO,
  ProviderDeleteFileDTO,
  ProviderFileResultDTO,
  ProviderGetFileDTO,
  ProviderUploadStreamDTO,
  Logger,
} from "@medusajs/framework/types"
import * as Bytescale from "@bytescale/sdk"
// @ts-expect-error
import nodeFetch from "node-fetch"
import { PassThrough, Readable, Writable } from "stream"

type BytescaleOptions = {
  apiKey: string
  accountId: string
  prefix?: string
}

type InjectedDependencies = {
  logger: Logger
}

export class BytescaleFileProviderService extends AbstractFileProviderService {
  static identifier = "bytescale-file"
  
  protected options_: BytescaleOptions
  protected uploadManager_: Bytescale.UploadManager
  protected fileApi_: Bytescale.FileApi
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: BytescaleOptions) {
    super()
    this.options_ = options
    this.logger_ = logger

    BytescaleFileProviderService.validateOptions(options)

    // Initialize Bytescale SDKs with node-fetch (v2) polyfill
    this.uploadManager_ = new Bytescale.UploadManager({
      // @ts-expect-error - node-fetch v3 types don't strictly match the SDK's expected Fetch API interface, but it works at runtime.
      fetchApi: nodeFetch,
      apiKey: options.apiKey,
    })

    this.fileApi_ = new Bytescale.FileApi({
      // @ts-expect-error - node-fetch v3 types don't strictly match the SDK's expected Fetch API interface, but it works at runtime.
      fetchApi: nodeFetch,
      apiKey: options.apiKey,
    })
  }

  static validateOptions(options: Record<any, any>) {
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Bytescale provider requires 'apiKey' option."
      )
    }
    if (!options.accountId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Bytescale provider requires 'accountId' option."
      )
    }
  }

  /**
   * Helper to normalize folder paths based on config.
   * Ensures format: "/path/to/folder" (Leading slash, no trailing slash).
   */
  private getUploadPath(): string {
    let folderPath = this.options_.prefix || "/uploads"
    if (!folderPath.startsWith("/")) {
      folderPath = `/${folderPath}`
    }
    if (folderPath.length > 1 && folderPath.endsWith("/")) {
      folderPath = folderPath.slice(0, -1)
    }
    return folderPath
  }

  /**
   * Uploads a file to Bytescale.
   * The SDK's `data` property accepts `string | Buffer | Stream`.
   */
  async upload(file: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    try {
      const result = await this.uploadManager_.upload({
        // Medusa types define content as string, but the SDK handles string, Buffer, or Stream.
        // We pass it directly without normalization.
        data: file.content,
        mime: file.mimeType,
        originalFileName: file.filename,
        path: {
          folderPath: this.getUploadPath(),
        }
      })

      return {
        url: result.fileUrl,
        key: result.filePath,
      }
    } catch (error) {
      this.logger_.error(`Bytescale upload failed for ${file.filename}: ${error.message}`)
      throw error
    }
  }

  /**
   * Deletes one or multiple files.
   */
  async delete(files: ProviderDeleteFileDTO | ProviderDeleteFileDTO[]): Promise<void> {
    const fileArray = Array.isArray(files) ? files : [files]
    
    // Execute deletes in parallel
    await Promise.all(
      fileArray.map(async (file) => {
        try {
          await this.fileApi_.deleteFile({
            accountId: this.options_.accountId,
            filePath: file.fileKey,
          })
        } catch (error) {
          // Log but don't throw to allow other files in the batch to process
          this.logger_.warn(`Bytescale delete failed for ${file.fileKey}: ${error.message}`)
        }
      })
    )
  }

  /**
   * Generates a public URL.
   */
  async getPresignedDownloadUrl(fileData: ProviderGetFileDTO): Promise<string> {
    try {
      return Bytescale.UrlBuilder.url({
        accountId: this.options_.accountId,
        filePath: fileData.fileKey,
      })
    } catch (error) {
      this.logger_.error(`Bytescale URL gen failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Returns a Writable stream that Medusa can pipe data into.
   */
  async getUploadStream(fileData: ProviderUploadStreamDTO): Promise<{
    writeStream: Writable
    promise: Promise<ProviderFileResultDTO>
    url: string
    fileKey: string
  }> {
    try {
      // Create a PassThrough stream. Medusa writes to this, Bytescale reads from this.
      const pass = new PassThrough()
      const folderPath = this.getUploadPath()
      
      const expectedKey = `${folderPath}/${fileData.filename}`
      const expectedUrl = Bytescale.UrlBuilder.url({
        accountId: this.options_.accountId,
        filePath: expectedKey
      })

      // Start the upload process immediately using the stream
      const uploadPromise = this.uploadManager_.upload({
        data: pass,
        mime: fileData.mimeType,
        originalFileName: fileData.filename,
        path: { folderPath }
      }).then(result => ({
        url: result.fileUrl,
        key: result.filePath
      }))

      return {
        writeStream: pass,
        promise: uploadPromise,
        url: expectedUrl,
        fileKey: expectedKey
      }
    } catch (error) {
      this.logger_.error(`Bytescale upload stream failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Gets the file as a Readable stream.
   */
  async getDownloadStream(fileData: ProviderGetFileDTO): Promise<Readable> {
    try {
      const response = await this.fileApi_.downloadFile({
        accountId: this.options_.accountId,
        filePath: fileData.fileKey,
      })
      
      // node-fetch response.body is a readable stream
      return response.raw.body as unknown as Readable
    } catch (error) {
      this.logger_.error(`Bytescale download stream failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Gets the file as a memory Buffer.
   */
  async getAsBuffer(fileData: ProviderGetFileDTO): Promise<Buffer> {
    try {
      const response = await this.fileApi_.downloadFile({
        accountId: this.options_.accountId,
        filePath: fileData.fileKey,
      })
      
      // Access the raw node-fetch response to use .buffer()
      // @ts-expect-error - node-fetch v2 response object has a buffer method
      return await response.raw.buffer()
    } catch (error) {
      this.logger_.error(`Bytescale buffer download failed: ${error.message}`)
      throw error
    }
  }
}
