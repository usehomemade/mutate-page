import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getAppConfig } from "@/lib/config";

type PutOptions = {
  contentType: string;
  cacheControl?: string;
};

export type ObjectStorage = {
  mode: "r2" | "local";
  put(key: string, body: string, options: PutOptions): Promise<void>;
  getText(key: string): Promise<string>;
  deletePrefix(prefix: string): Promise<void>;
};

const globalForStorage = globalThis as typeof globalThis & {
  mutateObjectStorage?: ObjectStorage;
};

function normalizedPrefix(prefix: string) {
  const normalized = prefix.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error("Object storage deletion requires a safe, non-empty prefix.");
  }
  return normalized;
}

function createR2Storage(): ObjectStorage | null {
  const { r2 } = getAppConfig();
  const values = [r2.accountId, r2.accessKeyId, r2.secretAccessKey, r2.bucket];
  const configuredValues = values.filter(Boolean).length;

  if (configuredValues === 0) return null;
  if (configuredValues !== values.length) {
    throw new Error(
      "R2 configuration is incomplete. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET together.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });

  return {
    mode: "r2",
    async put(key, body, options) {
      await client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: key,
          Body: body,
          ContentType: options.contentType,
          CacheControl: options.cacheControl,
        }),
      );
    },
    async getText(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
      );
      if (!result.Body) throw new Error(`R2 object ${key} had no body.`);
      return result.Body.transformToString("utf-8");
    },
    async deletePrefix(prefix) {
      const safePrefix = `${normalizedPrefix(prefix)}/`;
      let continuationToken: string | undefined;

      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: r2.bucket,
            Prefix: safePrefix,
            ContinuationToken: continuationToken,
          }),
        );
        const objects = (listed.Contents || [])
          .map((object) => object.Key)
          .filter((key): key is string => Boolean(key))
          .map((Key) => ({ Key }));

        if (objects.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: r2.bucket,
              Delete: { Objects: objects, Quiet: true },
            }),
          );
        }

        continuationToken = listed.IsTruncated
          ? listed.NextContinuationToken
          : undefined;
        if (listed.IsTruncated && !continuationToken) {
          throw new Error("R2 prefix listing was truncated without a continuation token.");
        }
      } while (continuationToken);
    },
  };
}

function createLocalStorage(): ObjectStorage {
  const root = path.resolve(getAppConfig().localObjectStoragePath);

  function resolveKey(key: string) {
    const resolved = path.resolve(root, key);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid object storage key.");
    }
    return resolved;
  }

  return {
    mode: "local",
    async put(key, body) {
      const target = resolveKey(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body, "utf8");
    },
    async getText(key) {
      return fs.readFile(resolveKey(key), "utf8");
    },
    async deletePrefix(prefix) {
      const target = resolveKey(normalizedPrefix(prefix));
      if (target === root) {
        throw new Error("Refusing to delete the object storage root.");
      }
      await fs.rm(target, { recursive: true, force: true });
    },
  };
}

export function getObjectStorage() {
  if (!globalForStorage.mutateObjectStorage) {
    globalForStorage.mutateObjectStorage = createR2Storage() || createLocalStorage();
  }

  return globalForStorage.mutateObjectStorage;
}
