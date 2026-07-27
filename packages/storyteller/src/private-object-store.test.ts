import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FilePrivateObjectStore,
  detectArtifactMedia,
  type StagedPrivateObject,
} from "./private-object-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function asciiBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function wavBytes(payload: readonly number[] = [0, 0, 0, 0]): Uint8Array {
  return bytes(
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    ...payload,
  );
}

function webpBytes(): Uint8Array {
  return bytes(
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
  );
}

async function withStore(
  run: (store: FilePrivateObjectStore, root: string) => Promise<void>,
  options: ConstructorParameters<typeof FilePrivateObjectStore>[1] = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-private-object-"));
  try {
    const store = new FilePrivateObjectStore(root, options);
    await run(store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("media detection recognises supported audio, image, archive and text signatures", () => {
  const cases: Array<[Uint8Array, string, string]> = [
    [wavBytes(), "audio/wav", "wav"],
    [asciiBytes("fLaC\u0000\u0000\u0000\u0000"), "audio/flac", "flac"],
    [bytes(0x49, 0x44, 0x33, 0x04, 0x00, 0x00), "audio/mpeg", "mp3"],
    [bytes(0xff, 0xfb, 0x90, 0x64), "audio/mpeg", "mp3"],
    [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png", "png"],
    [bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg", "jpeg"],
    [webpBytes(), "image/webp", "webp"],
    [bytes(0x50, 0x4b, 0x03, 0x04), "application/zip", "zip"],
    [asciiBytes('{"ok":true}'), "application/json", "json"],
    [asciiBytes("WEBVTT\n\n00:00.000 --> 00:01.000\nLine"), "text/vtt", "vtt"],
    [asciiBytes("A plain UTF-8 transcript.\n"), "text/plain", "txt"],
  ];

  for (const [input, mimeType, format] of cases) {
    const detected = detectArtifactMedia(input);
    assert.equal(detected.mimeType, mimeType);
    assert.equal(detected.format, format);
    assert.ok(detected.signature.length > 0);
  }
});

test("media detection rejects empty, unsupported binary and malformed JSON payloads", () => {
  assert.throws(() => detectArtifactMedia(new Uint8Array()), /PRIVATE_OBJECT_BYTES_REQUIRED/u);
  assert.throws(
    () => detectArtifactMedia(bytes(0x00, 0x01, 0x02, 0x03)),
    /PRIVATE_OBJECT_MEDIA_SIGNATURE_UNSUPPORTED/u,
  );
  assert.throws(
    () => detectArtifactMedia(asciiBytes('{"broken":')),
    /PRIVATE_OBJECT_JSON_INVALID/u,
  );
});

test("staging enforces size ceilings and claimed media identity", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      store.stage({ bytes: wavBytes(), claimedMimeType: "audio/mpeg" }),
      /PRIVATE_OBJECT_CLAIMED_MIME_MISMATCH/u,
    );
    await assert.rejects(
      store.stage({ bytes: wavBytes(), claimedFormat: "mp3" }),
      /PRIVATE_OBJECT_CLAIMED_FORMAT_MISMATCH/u,
    );
  });

  await withStore(async (store) => {
    await assert.rejects(
      store.stage({ bytes: wavBytes() }),
      /PRIVATE_OBJECT_SIZE_LIMIT_EXCEEDED/u,
    );
  }, { maximumBytes: 8 });
});

test("staging and promotion produce a verified content-addressed private object", async () => {
  await withStore(async (store, root) => {
    const source = wavBytes([1, 2, 3, 4, 5, 6]);
    const staged = await store.stage({
      bytes: source,
      claimedMimeType: "audio/wav",
      claimedFormat: "wav",
      now: t0,
    });
    assert.equal(staged.createdAt, t0.toISOString());
    assert.match(staged.stagingId, /^stage_[A-Za-z0-9_-]{32}$/u);
    assert.match(staged.contentHash, /^[a-f0-9]{64}$/u);
    assert.match(
      staged.objectKey,
      /^sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.wav$/u,
    );

    const stagedPath = join(root, "staging", `${staged.stagingId}.part`);
    assert.deepEqual(new Uint8Array(await readFile(stagedPath)), source);

    const finalised = await store.promote(staged, t1);
    assert.equal(finalised.finalisedAt, t1.toISOString());
    assert.equal(finalised.deduplicated, false);
    assert.equal(finalised.integrity.contentHash, staged.contentHash);
    assert.equal(finalised.integrity.byteCount, source.byteLength);
    assert.equal(finalised.integrity.mimeType, "audio/wav");
    assert.equal(finalised.storage.driver, "local-private-file");
    assert.equal(finalised.storage.objectKey, staged.objectKey);
    assert.equal(finalised.storage.versionId, staged.contentHash);
    assert.equal(JSON.stringify(finalised).includes(root), false);

    await assert.rejects(readFile(stagedPath), (error: unknown) => {
      return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
    });
    const objectPath = join(root, "objects", ...staged.objectKey.split("/"));
    assert.deepEqual(new Uint8Array(await readFile(objectPath)), source);
    const metadata = await stat(objectPath);
    if (process.platform !== "win32") assert.equal(metadata.mode & 0o777, 0o600);

    const inspected = await store.inspect(staged.objectKey);
    assert.equal(inspected.integrity.contentHash, staged.contentHash);
    assert.equal(inspected.integrity.byteCount, source.byteLength);
    assert.equal(inspected.signature, "riff-wave");
    assert.equal(JSON.stringify(inspected).includes(root), false);
  }, {
    provider: "evavo-private-file-store",
    container: "storyteller-production",
    region: "australia-southeast",
  });
});

test("identical content is deduplicated at the content-addressed object key", async () => {
  await withStore(async (store) => {
    const source = asciiBytes('{"schemaVersion":"analysis-v1","score":98}');
    const firstStage = await store.stage({ bytes: source, now: t0 });
    const first = await store.promote(firstStage, t0);
    const secondStage = await store.stage({ bytes: source, now: t1 });
    const second = await store.promote(secondStage, t1);

    assert.equal(first.storage.objectKey, second.storage.objectKey);
    assert.equal(first.integrity.contentHash, second.integrity.contentHash);
    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
  });
});

test("promotion detects staged-byte tampering before final object creation", async () => {
  await withStore(async (store, root) => {
    const staged = await store.stage({ bytes: wavBytes(), now: t0 });
    await writeFile(
      join(root, "staging", `${staged.stagingId}.part`),
      webpBytes(),
    );
    await assert.rejects(
      store.promote(staged, t1),
      /PRIVATE_OBJECT_STAGE_TAMPERED/u,
    );
    await store.discard(staged);
  });
});

test("staged metadata tampering is rejected by the stage fingerprint", async () => {
  await withStore(async (store) => {
    const staged = await store.stage({ bytes: wavBytes(), now: t0 });
    const tampered: StagedPrivateObject = {
      ...staged,
      byteCount: staged.byteCount + 1,
    };
    await assert.rejects(
      store.promote(tampered, t1),
      /PRIVATE_OBJECT_STAGE_FINGERPRINT_MISMATCH/u,
    );
    await store.discard(staged);
  });
});

test("object inspection rejects URLs, traversal, absolute paths and backslashes", async () => {
  await withStore(async (store) => {
    for (const objectKey of [
      "../escape.wav",
      "sha256/aa/../escape.wav",
      "/absolute/object.wav",
      "https://storage.example/object.wav",
      "sha256\\aa\\object.wav",
      "sha256/aa/object.wav?token=secret",
    ]) {
      await assert.rejects(store.inspect(objectKey), /PRIVATE_OBJECT_KEY_INVALID/u);
    }
  });
});

test("discard removes unpromoted staged bytes without returning private paths", async () => {
  await withStore(async (store, root) => {
    const staged = await store.stage({ bytes: asciiBytes("temporary transcript"), now: t0 });
    const path = join(root, "staging", `${staged.stagingId}.part`);
    await store.discard(staged);
    await assert.rejects(readFile(path), (error: unknown) => {
      return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
    });
    assert.equal(JSON.stringify(staged).includes(root), false);
  });
});
