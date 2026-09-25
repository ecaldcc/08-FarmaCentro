import { Schema, model, type ClientSession } from 'mongoose';

export interface ICounter {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', strict: 'throw', versionKey: false },
);

export const Counter = model<ICounter>('Counter', CounterSchema);

/** Next correlative inside the caller's transaction, formatted as PREFIX-000001. */
export async function nextNumber(name: 'sale' | 'prescription', prefix: string, session: ClientSession): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, session },
  );
  return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
}
