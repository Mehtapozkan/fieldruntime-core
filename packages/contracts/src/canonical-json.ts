import { createHash } from "node:crypto";
import { types as utilityTypes } from "node:util";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class CanonicalJsonError extends Error {
  readonly code = "NON_CANONICAL_JSON";
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "CanonicalJsonError";
    this.path = path;
  }
}

function assertStorageCompatibleString(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0) {
      throw new CanonicalJsonError(
        path,
        "strings may not contain the null character",
      );
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        throw new CanonicalJsonError(
          path,
          "strings may not contain unpaired Unicode surrogates",
        );
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new CanonicalJsonError(
        path,
        "strings may not contain unpaired Unicode surrogates",
      );
    }
  }
}

function normalizeJson(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    assertStorageCompatibleString(value, path);
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(path, "numbers must be finite");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new CanonicalJsonError(
      path,
      `unsupported JSON value of type ${typeof value}`,
    );
  }

  if (utilityTypes.isProxy(value)) {
    throw new CanonicalJsonError(path, "proxy objects are not accepted");
  }

  if (ancestors.has(value)) {
    throw new CanonicalJsonError(path, "cyclic values are not accepted");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new CanonicalJsonError(path, "only ordinary arrays are accepted");
      }
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some(
          (key) =>
            typeof key !== "string" ||
            (key !== "length" &&
              (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)),
        )
      ) {
        throw new CanonicalJsonError(
          path,
          "arrays may not contain symbols or named properties",
        );
      }

      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new CanonicalJsonError(path, "sparse arrays are not accepted");
        }

        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (
          descriptor === undefined ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        ) {
          throw new CanonicalJsonError(
            `${path}/${String(index)}`,
            "accessor properties are not accepted",
          );
        }
        const descriptorValue: unknown = descriptor.value;
        Object.defineProperty(result, index, {
          configurable: true,
          enumerable: true,
          value: normalizeJson(
            descriptorValue,
            `${path}/${String(index)}`,
            ancestors,
          ),
          writable: true,
        });
      }
      return result;
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(
        path,
        "only plain objects and null-prototype objects are accepted",
      );
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      throw new CanonicalJsonError(path, "symbol keys are not accepted");
    }

    const result = Object.create(null) as Record<string, JsonValue>;
    const sortedKeys = (keys as string[]).sort();
    for (let index = 0; index < sortedKeys.length; index += 1) {
      const key = sortedKeys[index];
      if (key === undefined) {
        throw new CanonicalJsonError(path, "object normalization failed");
      }
      assertStorageCompatibleString(key, `${path}/${key}`);
      if (PROHIBITED_KEYS.has(key)) {
        throw new CanonicalJsonError(
          `${path}/${key}`,
          "prototype-sensitive keys are not accepted",
        );
      }

      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        throw new CanonicalJsonError(
          `${path}/${key}`,
          "only enumerable data properties are accepted",
        );
      }

      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: normalizeJson(descriptor.value, `${path}/${key}`, ancestors),
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function deepFreeze(value: JsonValue): JsonValue {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined) {
        throw new CanonicalJsonError(
          `$/${String(index)}`,
          "array freezing encountered a missing item",
        );
      }
      const item: unknown = descriptor.value;
      deepFreeze(item as JsonValue);
    }
  } else {
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) {
        throw new CanonicalJsonError("$", "object freezing failed");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined) {
        throw new CanonicalJsonError(`$/${key}`, "object freezing failed");
      }
      const item: unknown = descriptor.value;
      deepFreeze(item as JsonValue);
    }
  }

  return Object.freeze(value);
}

function quoteJsonString(value: string): string {
  return JSON.stringify(value);
}

function serializeCanonical(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return quoteJsonString(value);
  }

  if (Array.isArray(value)) {
    const items = value as readonly JsonValue[];
    let serialized = "[";
    for (let index = 0; index < items.length; index += 1) {
      if (index > 0) {
        serialized += ",";
      }
      serialized += serializeCanonical(items[index] as JsonValue);
    }
    return `${serialized}]`;
  }

  const record = value as Readonly<Record<string, JsonValue>>;
  const keys = Object.keys(record).sort();
  let serialized = "{";
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      throw new CanonicalJsonError("$", "object serialization failed");
    }
    if (index > 0) {
      serialized += ",";
    }
    serialized += `${quoteJsonString(key)}:${serializeCanonical(record[key] as JsonValue)}`;
  }
  return `${serialized}}`;
}

export function canonicalizeJson(value: unknown): JsonValue {
  return normalizeJson(value, "$", new WeakSet<object>());
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(canonicalizeJson(value));
}

export function sha256Json(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function immutableJson<T>(value: T): T {
  return deepFreeze(canonicalizeJson(value)) as T;
}
