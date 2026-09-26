import { describe, expect, it } from 'vitest';
import { withDefaultDb } from '../../src/db/uri.js';

describe('connection string database', () => {
  it('adds farmacentro when the Atlas string has no database', () => {
    expect(withDefaultDb('mongodb+srv://u:p@c.x.mongodb.net/?retryWrites=true&w=majority&appName=c')).toBe(
      'mongodb+srv://u:p@c.x.mongodb.net/farmacentro?retryWrites=true&w=majority&appName=c',
    );
    expect(withDefaultDb('mongodb+srv://u:p@c.x.mongodb.net')).toBe('mongodb+srv://u:p@c.x.mongodb.net/farmacentro');
    expect(withDefaultDb('mongodb://localhost:27017/')).toBe('mongodb://localhost:27017/farmacentro');
  });

  it('keeps an explicit database', () => {
    expect(withDefaultDb('mongodb+srv://u:p@c.x.mongodb.net/farmacentro?retryWrites=true')).toBe(
      'mongodb+srv://u:p@c.x.mongodb.net/farmacentro?retryWrites=true',
    );
    expect(withDefaultDb('mongodb://127.0.0.1:27017/otra?replicaSet=rs0')).toBe('mongodb://127.0.0.1:27017/otra?replicaSet=rs0');
  });
});
