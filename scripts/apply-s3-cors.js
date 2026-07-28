/**
 * Apply S3 CORS so browser admin uploads (presigned PUT from pomopal.lol)
 * succeed. Without this, Chrome blocks the preflight and you see:
 *   No 'Access-Control-Allow-Origin' header is present on the requested resource
 *
 * Usage (from pomopal-backend, with .env loaded):
 *   node scripts/apply-s3-cors.js
 */
require('dotenv').config();
const {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} = require('@aws-sdk/client-s3');

async function main() {
  const region = (process.env.BUCKET_REGION || '').trim();
  const bucket = (process.env.BUCKET_NAME || '').trim();
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'BUCKET_REGION, BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY required',
    );
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const CORSConfiguration = {
    CORSRules: [
      {
        AllowedOrigins: [
          'https://pomopal.lol',
          'https://www.pomopal.lol',
          'https://pomopal.vercel.app',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
        ],
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
        MaxAgeSeconds: 3000,
      },
    ],
  };

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration,
    }),
  );

  const current = await client.send(
    new GetBucketCorsCommand({ Bucket: bucket }),
  );
  console.log(`CORS applied to s3://${bucket}`);
  console.log(JSON.stringify(current.CORSRules, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
