import { ulid } from 'ulid';

/** A new, lexicographically-sortable, time-prefixed unique id. */
export function newId(): string {
  return ulid();
}
