/** Independent tab storage adapters can share this backing map in behavior tests. */
export class TestStorage implements Storage {
  constructor(private readonly values = new Map<string, string>()) {}
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
  fork() { return new TestStorage(this.values); }
}
