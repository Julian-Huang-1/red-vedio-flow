export type DataBoolean = true | undefined

export function dataBoolean(value: unknown): DataBoolean {
  return value ? true : undefined
}

