"use client";

import { compressImageToBase64 } from "@/lib/clientImageCompression";

export type PropertyPhotoUploadInput = {
  data: string;
  ext: string;
  width?: number;
  height?: number;
};

export type UploadedPropertyPhoto = {
  url: string;
  width?: number;
  height?: number;
};

const PHOTO_UPLOAD_CHUNK_SIZE = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function parseUploadResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function getUploadErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Upload failed";
  const maybeError = payload as { error?: unknown; message?: unknown };
  if (typeof maybeError.error === "string") return maybeError.error;
  if (typeof maybeError.message === "string") return maybeError.message;
  return "Upload failed";
}

function getUploadedImages(payload: unknown): UploadedPropertyPhoto[] {
  if (!payload || typeof payload !== "object") return [];

  const maybeImages = (payload as { images?: unknown }).images;
  if (!Array.isArray(maybeImages)) return [];

  return maybeImages.filter(
    (image): image is UploadedPropertyPhoto =>
      !!image &&
      typeof image === "object" &&
      typeof (image as { url?: unknown }).url === "string",
  );
}

export async function compressPropertyPhotoFiles(
  files: File[],
  chunkSize = PHOTO_UPLOAD_CHUNK_SIZE,
): Promise<PropertyPhotoUploadInput[]> {
  const compressedPhotos: PropertyPhotoUploadInput[] = [];

  for (const fileChunk of chunk(files, chunkSize)) {
    const compressedChunk = await Promise.all(
      fileChunk.map((file) => compressImageToBase64(file)),
    );
    compressedPhotos.push(...compressedChunk);
  }

  return compressedPhotos;
}

export async function uploadCompressedPropertyPhotos({
  propertyId,
  token,
  photos,
  chunkSize = PHOTO_UPLOAD_CHUNK_SIZE,
}: {
  propertyId: string;
  token: string;
  photos: PropertyPhotoUploadInput[];
  chunkSize?: number;
}): Promise<UploadedPropertyPhoto[]> {
  const uploadedPhotos: UploadedPropertyPhoto[] = [];

  for (const photoChunk of chunk(photos, chunkSize)) {
    const response = await fetch(`/api/properties/${propertyId}/upload-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ images: photoChunk }),
    });

    const payload = await parseUploadResponse(response);
    const success =
      payload &&
      typeof payload === "object" &&
      "success" in payload &&
      (payload as { success?: unknown }).success === true;

    if (!response.ok || !success) {
      throw new Error(getUploadErrorMessage(payload));
    }

    uploadedPhotos.push(...getUploadedImages(payload));
  }

  return uploadedPhotos;
}

export async function uploadPropertyPhotoFiles({
  propertyId,
  token,
  files,
  chunkSize = PHOTO_UPLOAD_CHUNK_SIZE,
}: {
  propertyId: string;
  token: string;
  files: File[];
  chunkSize?: number;
}): Promise<UploadedPropertyPhoto[]> {
  const uploadedPhotos: UploadedPropertyPhoto[] = [];

  for (const fileChunk of chunk(files, chunkSize)) {
    const compressedPhotos = await compressPropertyPhotoFiles(
      fileChunk,
      chunkSize,
    );
    const uploadedChunk = await uploadCompressedPropertyPhotos({
      propertyId,
      token,
      photos: compressedPhotos,
      chunkSize,
    });
    uploadedPhotos.push(...uploadedChunk);
  }

  return uploadedPhotos;
}
