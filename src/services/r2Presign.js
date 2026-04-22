import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL;

export async function getPresignedUploadUrl(filename, contentType, expiresIn = 60) {
  const key = `products/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  
  const presignedUrl = await getSignedUrl(R2, command, { expiresIn });
  const publicUrl = `${PUBLIC_URL}/${key}`;
  
  return { presignedUrl, publicUrl, key };
}
