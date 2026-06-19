import type {
  BaseOptions,
  EnvSource,
  InferRawSettings,
  InferSettings,
  ResolveCtx,
  SettingsSchema,
  TypeDef,
} from "./core.js";
import { isType } from "./core.js";
import {
  arrayType,
  booleanType,
  constant,
  dateType,
  durationType,
  func,
  json,
  numberType,
  objectType,
  stringType,
  template,
  urlType,
} from "./factories.js";
import { valibotSchema, zodSchema } from "./schema.js";
import type { SecretOptions } from "./secret.js";
import { secret } from "./secret.js";

export type {
  BaseOptions,
  EnvSource,
  InferRawSettings,
  InferSettings,
  ResolveCtx,
  SecretOptions,
  SettingsSchema,
  TypeDef,
};
export {
  arrayType,
  booleanType,
  constant,
  dateType,
  durationType,
  func,
  isType,
  json,
  numberType,
  objectType,
  secret,
  stringType,
  template,
  urlType,
  valibotSchema,
  zodSchema,
};

export default {
  string: stringType,
  number: numberType,
  boolean: booleanType,
  date: dateType,
  array: arrayType,
  json,
  url: urlType,
  duration: durationType,
  template,
  func,
  constant,
  object: objectType,
  zodSchema,
  valibotSchema,
  secret,
};
