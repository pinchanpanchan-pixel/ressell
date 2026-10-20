import { describe, expect, it } from 'vitest';
import { applyBps, centsToInput, formatEUR, parseEuroToCents } from '@/lib/money';

describe('dinero en céntimos', () => {
  it('interpreta importes en formato español y anglosajón', () => {
    expect(parseEuroToCents('17,50')).toBe(1750);
    expect(parseEuroToCents('17.5')).toBe(1750);
    expect(parseEuroToCents('1.234,56')).toBe(123456);
    expect(parseEuroToCents('1.234')).toBe(123400);
    expect(parseEuroToCents('70 €')).toBe(7000);
    expect(parseEuroToCents('0,1')).toBe(10);
    expect(parseEuroToCents('-5,25')).toBe(-525);
  });
  it('rechaza entradas inválidas o con más de dos decimales', () => {
    expect(parseEuroToCents('')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNull();
    expect(parseEuroToCents('1,234')).toBeNull();
    expect(parseEuroToCents('1,2,3')).toBeNull();
  });
  it('no acumula errores de coma flotante', () => {
    // 0,1 + 0,2 en euros con floats da 0,30000000000000004; en céntimos es exacto
    expect(parseEuroToCents('0,10')! + parseEuroToCents('0,20')!).toBe(30);
    expect(applyBps(7000, 1250)).toBe(875);
  });
  it('formatea en euros', () => {
    expect(formatEUR(1750).replace(/\s/g, ' ')).toBe('17,50 €');
    expect(centsToInput(1750)).toBe('17,50');
    expect(centsToInput(-5)).toBe('-0,05');
  });
});
