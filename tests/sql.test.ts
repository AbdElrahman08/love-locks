import { describe, it, expect } from 'vitest';
import { toPostgres } from '../server/sql.ts';

describe('toPostgres', () => {
  it('numbers positional placeholders', () => {
    expect(toPostgres('SELECT * FROM t WHERE a = ? AND b = ?', [1, 2])).toEqual({ text: 'SELECT * FROM t WHERE a = $1 AND b = $2', values: [1, 2] });
  });
  it('maps named parameters, reusing the same index for repeats', () => {
    const r = toPostgres('SELECT $actor, $id, $actor', [{ id: 'x', actor: 'a' }]);
    expect(r).toEqual({ text: 'SELECT $1, $2, $1', values: ['a', 'x'] });
  });
  it('throws on a missing named parameter', () => {
    expect(() => toPostgres('SELECT $nope', [{}])).toThrow(/nope/);
  });
  it('translates INSERT OR IGNORE and aggregates', () => {
    expect(toPostgres('INSERT OR IGNORE INTO t (a) VALUES (?)', [1]).text).toBe('INSERT INTO t (a) VALUES ($1) ON CONFLICT DO NOTHING');
    expect(toPostgres('SELECT json_group_object(k, v), group_concat(DISTINCT r.reason) FROM t', []).text)
      .toBe("SELECT json_object_agg(k, v), string_agg(DISTINCT r.reason, ',') FROM t");
  });
});
