'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { putBlob, deleteBlob } from '@/lib/storage';
import { appendAudit } from '@/lib/audit';

/** Upload a document; encrypted at rest, versioned, expiry-tracked. */
export async function uploadDocument(formData: FormData) {
  const candidateId = String(formData.get('candidateId') ?? '');
  const type = String(formData.get('type') ?? 'other');
  const label = String(formData.get('label') ?? '').trim() || null;
  const file = formData.get('file');
  if (!candidateId || !(file instanceof File) || file.size === 0) {
    throw new Error('candidateId and a non-empty file are required');
  }

  const validUntilRaw = String(formData.get('validUntil') ?? '').trim();
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = putBlob(buf);

  // One Document per (candidate,type); new uploads become the current version.
  let doc = await prisma.document.findFirst({ where: { candidateId, type } });
  if (!doc) {
    doc = await prisma.document.create({ data: { candidateId, type, label } });
  } else {
    await prisma.documentVersion.updateMany({
      where: { documentId: doc.id },
      data: { isCurrent: false },
    });
  }

  const version = await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      blobRef: stored.blobRef,
      filename: file.name,
      mime: file.type || 'application/octet-stream',
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
      isCurrent: true,
    },
  });

  await appendAudit({
    actor: 'operator',
    action: 'document.upload',
    candidateId,
    entityRef: `documentVersion:${version.id}`,
    after: { type, filename: file.name, sha256: stored.sha256 },
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/candidates/${candidateId}/documents`);
}

export async function setCurrentVersion(versionId: string, candidateId: string) {
  const version = await prisma.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error('version not found');
  await prisma.documentVersion.updateMany({
    where: { documentId: version.documentId },
    data: { isCurrent: false },
  });
  await prisma.documentVersion.update({ where: { id: versionId }, data: { isCurrent: true } });
  await appendAudit({
    actor: 'operator',
    action: 'document.set_current',
    candidateId,
    entityRef: `documentVersion:${versionId}`,
  });
  revalidatePath(`/candidates/${candidateId}/documents`);
}

export async function deleteDocumentVersion(versionId: string, candidateId: string) {
  const version = await prisma.documentVersion.findUnique({ where: { id: versionId } });
  if (!version) return;
  deleteBlob(version.blobRef);
  await prisma.documentVersion.delete({ where: { id: versionId } });
  await appendAudit({
    actor: 'operator',
    action: 'document.delete_version',
    candidateId,
    entityRef: `documentVersion:${versionId}`,
  });
  revalidatePath(`/candidates/${candidateId}/documents`);
}
