import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'

const accountId  = process.env.R2_ACCOUNT_ID!
const accessKey  = process.env.R2_ACCESS_KEY_ID!
const secretKey  = process.env.R2_SECRET_ACCESS_KEY!
const bucketName = process.env.R2_BUCKET_NAME!

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
})

export { bucketName }

/** List all object keys under a prefix (e.g. "images/directors/") */
export async function listR2Keys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    })
    const res = await r2.send(cmd)
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

/** Upload a buffer to R2 and return the R2 key */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType = 'image/jpeg',
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return key
}

/** Delete a key from R2 (no-op if it doesn't exist) */
export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }))
}

/** Copy an existing R2 object to a new key (same bucket) */
export async function copyInR2(srcKey: string, destKey: string): Promise<void> {
  await r2.send(new CopyObjectCommand({
    Bucket:     bucketName,
    CopySource: `${bucketName}/${srcKey}`,
    Key:        destKey,
  }))
}

/** List immediate sub-prefixes (virtual "folders") under a given prefix */
export async function listR2Prefixes(prefix = ''): Promise<string[]> {
  const cmd = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
    Delimiter: '/',
  })
  const res = await r2.send(cmd)
  return (res.CommonPrefixes ?? []).map(p => p.Prefix ?? '').filter(Boolean)
}

/** Download an R2 text object and return its content as a string */
export async function getR2Text(key: string): Promise<string> {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucketName, Key: key }))
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/** Check whether a specific key exists in R2 */
export async function r2KeyExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }))
    return true
  } catch {
    return false
  }
}
