import { TempoAddress } from 'viem/tempo'
import { describe, expect, test } from 'vitest'

const account = '0x742d35CC6634c0532925a3B844bc9e7595F2Bd28' as const
const tempoAddress = 'tempox0x742d35cc6634c0532925a3b844bc9e7595f2bd28' as const

describe('format', () => {
  test('behavior: encodes hex address to tempo address', () => {
    expect(TempoAddress.format(account)).toMatchInlineSnapshot(
      `"tempox0x742d35cc6634c0532925a3b844bc9e7595f2bd28"`,
    )
  })

  test('behavior: preserves tempo address', () => {
    expect(TempoAddress.format(tempoAddress)).toMatchInlineSnapshot(
      `"tempox0x742d35cc6634c0532925a3b844bc9e7595f2bd28"`,
    )
  })
})

describe('parse', () => {
  test('behavior: decodes tempo address', () => {
    expect(TempoAddress.parse(tempoAddress)).toMatchInlineSnapshot(`
      {
        "address": "0x742d35CC6634c0532925a3B844bc9e7595F2Bd28",
      }
    `)
  })

  test('error: invalid prefix', () => {
    expect(() =>
      TempoAddress.parse(account),
    ).toThrowErrorMatchingInlineSnapshot(
      `[TempoAddress.InvalidPrefixError: Tempo address "0x742d35CC6634c0532925a3B844bc9e7595F2Bd28" has an invalid prefix. Expected "tempox".]`,
    )
  })
})

describe('resolve', () => {
  test('behavior: resolves tempo address to checksummed hex address', () => {
    expect(TempoAddress.resolve(tempoAddress)).toMatchInlineSnapshot(
      `"0x742d35CC6634c0532925a3B844bc9e7595F2Bd28"`,
    )
  })

  test('behavior: passes through standard address', () => {
    expect(TempoAddress.resolve(account)).toMatchInlineSnapshot(
      `"0x742d35CC6634c0532925a3B844bc9e7595F2Bd28"`,
    )
  })
})

describe('validate', () => {
  test('behavior: returns true for valid tempo address', () => {
    expect(TempoAddress.validate(tempoAddress)).toBe(true)
  })

  test('behavior: returns false for standard or malformed address', () => {
    expect(TempoAddress.validate(account)).toBe(false)
    expect(TempoAddress.validate('tempox0xzzzz')).toBe(false)
  })
})
